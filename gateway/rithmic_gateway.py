"""Local credential gateway for the OpenBackTest Rithmic data connection.

The browser sends the user's Rithmic login over a local WebSocket. This
process opens the R|Protocol Ticker Plant connection, keeps the credentials
out of the browser after login, and forwards normalized one-minute candles.

This gateway intentionally implements market data only. It does not place,
modify, or cancel orders.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import ssl
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import websockets
from google.protobuf.message import DecodeError
from rithmic.protocol_buffers import (
    base_pb2,
    last_trade_pb2,
    request_heartbeat_pb2,
    request_login_pb2,
    request_logout_pb2,
    request_market_data_update_pb2,
    request_reference_data_pb2,
    response_login_pb2,
    response_reference_data_pb2,
)

LOGGER = logging.getLogger("openbacktest.rithmic")
TICKER_PLANT = request_login_pb2.RequestLogin.SysInfraType.TICKER_PLANT
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8765
MAX_CANDLES = 2000
RITHMIC_URI = "wss://rituz00100.rithmic.com:443"
RITHMIC_SYSTEM_NAME = "Rithmic Paper Trading"
RITHMIC_APP_NAME = "OpenBackTest"
RITHMIC_APP_VERSION = "1.0.0"
DEFAULT_SECURITY_CODE = "ES"
DEFAULT_EXCHANGE = "CME"


def frame(message: Any) -> bytes:
    payload = message.SerializeToString()
    return len(payload).to_bytes(4, byteorder="big", signed=True) + payload


def template_id(buffer: bytes) -> int:
    base = base_pb2.Base()
    base.ParseFromString(buffer[4:])
    return base.template_id


def rithmic_ssl_context() -> ssl.SSLContext:
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    certificate = Path(__file__).resolve().parent / "rithmic_ssl_cert_auth_params"
    if not certificate.exists():
        try:
            import rithmic

            package_certificate = (
                Path(rithmic.__file__).resolve().parent
                / "certificates"
                / "rithmic_ssl_cert_auth_params"
            )
            if package_certificate.exists():
                certificate = package_certificate
        except ImportError:
            pass
    if certificate.exists():
        context.load_verify_locations(certificate)
    else:
        context.load_default_certs()
    return context


def error_message(value: Any) -> str:
    if isinstance(value, Exception):
        return str(value)
    return str(value)


def rithmic_response_error(codes: Any, messages: Any, fallback: str) -> str:
    code = str(codes[0]) if codes else "unknown"
    details = list(messages) or list(codes)
    reason = "; ".join(details) if details else fallback
    if code == "1067":
        return (
            f"Rithmic rejected the configured system name (1067): {reason}. "
            "This Phidias login must be enabled for direct R|Protocol/API access; "
            "ordinary R|Trader Pro or Quantower access is not sufficient."
        )
    return f"Rithmic login rejected ({code}): {reason}"


@dataclass
class CredentialSet:
    username: str
    password: str

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "CredentialSet":
        required = {
            "username": payload.get("username", ""),
            "password": payload.get("password", ""),
        }
        missing = [key for key, value in required.items() if not value]
        if missing:
            raise ValueError(f"Missing Rithmic fields: {', '.join(missing)}")
        return cls(**required)


class CandleBuffer:
    def __init__(self) -> None:
        self._candles: dict[str, deque[dict[str, Any]]] = defaultdict(
            lambda: deque(maxlen=MAX_CANDLES)
        )
        self._current: dict[str, dict[str, Any]] = {}

    def add_trade(self, symbol: str, exchange: str, price: float, volume: int, timestamp: int) -> dict[str, Any]:
        minute = timestamp - (timestamp % 60)
        key = f"{symbol}.{exchange}"
        current = self._current.get(key)
        if current is None or current["time"] != minute:
            current = {
                "time": minute,
                "open": price,
                "high": price,
                "low": price,
                "close": price,
                "volume": 0,
                "symbol": key,
            }
            self._current[key] = current
            self._candles[key].append(current)
        current["high"] = max(current["high"], price)
        current["low"] = min(current["low"], price)
        current["close"] = price
        current["volume"] += max(volume, 0)
        return dict(current)

    def get(self, symbol: str, exchange: str, limit: int) -> list[dict[str, Any]]:
        key = f"{symbol}.{exchange}"
        return list(self._candles[key])[-limit:]


class RithmicSession:
    def __init__(self, browser: websockets.ServerConnection, credentials: CredentialSet) -> None:
        self.browser = browser
        self.credentials = credentials
        self.rithmic: Any = None
        self.subscriptions: set[tuple[str, str]] = set()
        self.candles = CandleBuffer()
        self.instrument: dict[str, Any] | None = None
        self.closed = False

    async def send_browser(self, message: dict[str, Any]) -> None:
        if not self.closed:
            await self.browser.send(json.dumps(message))

    async def connect_rithmic(self) -> None:
        self.rithmic = await websockets.connect(
            RITHMIC_URI,
            ssl=rithmic_ssl_context(),
            ping_interval=3,
        )

        login = request_login_pb2.RequestLogin()
        login.template_id = 10
        login.template_version = "3.9"
        login.user = self.credentials.username
        login.password = self.credentials.password
        login.app_name = RITHMIC_APP_NAME
        login.app_version = RITHMIC_APP_VERSION
        login.system_name = RITHMIC_SYSTEM_NAME
        login.infra_type = TICKER_PLANT
        await self.rithmic.send(frame(login))

        response_buffer = await asyncio.wait_for(self.rithmic.recv(), timeout=15)
        response = response_login_pb2.ResponseLogin()
        response.ParseFromString(response_buffer[4:])
        if not response.rp_code or response.rp_code[0] != "0":
            raise RuntimeError(rithmic_response_error(
                response.rp_code,
                response.user_msg,
                "Unknown Rithmic login failure",
            ))

        self.instrument = await self.resolve_front_month()
        await self.send_browser({
            "type": "connected",
            "symbols": [{
                "symbol": f"{self.instrument['symbol']}.{self.instrument['exchange']}",
                "displayName": self.instrument['symbol'],
                "exchange": self.instrument['exchange'],
                "assetType": "futures",
                "tickSize": self.instrument.get("tick_size"),
                "pointValue": self.instrument.get("point_value"),
            }],
        })

    async def resolve_front_month(self) -> dict[str, Any]:
        if not self.rithmic:
            raise RuntimeError("Rithmic is not connected")

        request = request_reference_data_pb2.RequestReferenceData()
        request.template_id = 14
        request.user_msg.append(f"{DEFAULT_SECURITY_CODE}|{DEFAULT_EXCHANGE}")
        request.symbol = DEFAULT_SECURITY_CODE
        request.exchange = DEFAULT_EXCHANGE
        await self.rithmic.send(frame(request))

        deadline = asyncio.get_running_loop().time() + 15
        while True:
            remaining = max(0.1, deadline - asyncio.get_running_loop().time())
            buffer = await asyncio.wait_for(self.rithmic.recv(), timeout=remaining)
            try:
                current_template = template_id(buffer)
            except DecodeError:
                LOGGER.warning("Ignoring malformed Rithmic reference-data message")
                continue

            if current_template != 15:
                continue

            response = response_reference_data_pb2.ResponseReferenceData()
            response.ParseFromString(buffer[4:])
            if not response.rp_code or response.rp_code[0] != "0":
                raise RuntimeError(rithmic_response_error(
                    response.rp_code,
                    response.user_msg,
                    "Unable to resolve the current ES contract",
                ))

            symbol = response.trading_symbol or response.symbol
            exchange = response.trading_exchange or response.exchange or DEFAULT_EXCHANGE
            if not symbol:
                raise RuntimeError("Rithmic returned no current ES contract")

            return {
                "symbol": symbol,
                "exchange": exchange,
                "tick_size": response.min_fprice_change or response.min_qprice_change,
                "point_value": response.single_point_value,
            }

    async def subscribe(self, symbol: str, exchange: str) -> None:
        if not self.rithmic:
            raise RuntimeError("Rithmic is not connected")
        request = request_market_data_update_pb2.RequestMarketDataUpdate()
        request.template_id = 100
        request.user_msg.append("OpenBackTest subscribe")
        request.symbol = symbol
        request.exchange = exchange
        request.request = request_market_data_update_pb2.RequestMarketDataUpdate.Request.SUBSCRIBE
        request.update_bits = request_market_data_update_pb2.RequestMarketDataUpdate.UpdateBits.LAST_TRADE
        await self.rithmic.send(frame(request))
        self.subscriptions.add((symbol, exchange))

    async def unsubscribe(self, symbol: str, exchange: str) -> None:
        if not self.rithmic:
            return
        request = request_market_data_update_pb2.RequestMarketDataUpdate()
        request.template_id = 100
        request.user_msg.append("OpenBackTest unsubscribe")
        request.symbol = symbol
        request.exchange = exchange
        request.request = request_market_data_update_pb2.RequestMarketDataUpdate.Request.UNSUBSCRIBE
        request.update_bits = request_market_data_update_pb2.RequestMarketDataUpdate.UpdateBits.LAST_TRADE
        await self.rithmic.send(frame(request))
        self.subscriptions.discard((symbol, exchange))

    async def consume_rithmic(self) -> None:
        while not self.closed and self.rithmic:
            try:
                buffer = await asyncio.wait_for(self.rithmic.recv(), timeout=5)
            except asyncio.TimeoutError:
                heartbeat = request_heartbeat_pb2.RequestHeartbeat()
                heartbeat.template_id = 18
                await self.rithmic.send(frame(heartbeat))
                continue

            try:
                current_template = template_id(buffer)
            except DecodeError:
                LOGGER.warning("Ignoring malformed Rithmic message")
                continue

            if current_template != 150:
                continue

            trade = last_trade_pb2.LastTrade()
            trade.ParseFromString(buffer[4:])
            if trade.trade_price <= 0 or trade.trade_size <= 0:
                continue

            timestamp = trade.ssboe or int(time.time())
            candle = self.candles.add_trade(
                trade.symbol,
                trade.exchange,
                trade.trade_price,
                trade.trade_size,
                timestamp,
            )
            await self.send_browser({"type": "candle", "candle": candle})

    async def handle_browser(self) -> None:
        async for raw_message in self.browser:
            message = json.loads(raw_message)
            message_type = message.get("type")
            if message_type == "subscribe":
                qualified_symbol = str(message.get("symbol", ""))
                symbol, _, exchange = qualified_symbol.rpartition(".")
                if not symbol:
                    symbol, exchange = qualified_symbol, DEFAULT_EXCHANGE
                await self.subscribe(symbol, exchange)
                continue
            if message_type == "unsubscribe":
                qualified_symbol = str(message.get("symbol", ""))
                symbol, _, exchange = qualified_symbol.rpartition(".")
                if not symbol:
                    symbol, exchange = qualified_symbol, DEFAULT_EXCHANGE
                await self.unsubscribe(symbol, exchange)
                continue
            if message_type == "history":
                qualified_symbol = str(message.get("symbol", ""))
                symbol, _, exchange = qualified_symbol.rpartition(".")
                if not symbol:
                    symbol, exchange = qualified_symbol, DEFAULT_EXCHANGE
                await self.send_browser({
                    "type": "history",
                    "requestId": message.get("requestId"),
                    "candles": self.candles.get(symbol, exchange, int(message.get("limit", 1000))),
                })

    async def close(self) -> None:
        self.closed = True
        if self.rithmic:
            try:
                logout = request_logout_pb2.RequestLogout()
                logout.template_id = 12
                logout.user_msg.append("OpenBackTest logout")
                await self.rithmic.send(frame(logout))
                await self.rithmic.close()
            except Exception:
                LOGGER.debug("Rithmic close failed", exc_info=True)


async def handle_browser(browser: websockets.ServerConnection) -> None:
    session: RithmicSession | None = None
    try:
        raw_message = await asyncio.wait_for(browser.recv(), timeout=15)
        message = json.loads(raw_message)
        if message.get("type") != "connect":
            raise ValueError("First gateway message must be connect")

        session = RithmicSession(browser, CredentialSet.from_payload(message.get("credentials", {})))
        await session.connect_rithmic()
        browser_task = asyncio.create_task(session.handle_browser())
        rithmic_task = asyncio.create_task(session.consume_rithmic())
        _, pending = await asyncio.wait(
            (browser_task, rithmic_task),
            return_when=asyncio.FIRST_COMPLETED,
        )
        for task in pending:
            task.cancel()
        await asyncio.gather(*pending, return_exceptions=True)
    except Exception as exc:
        LOGGER.info("Rithmic session ended: %s", exc)
        try:
            await browser.send(json.dumps({"type": "error", "message": error_message(exc)}))
        except Exception:
            pass
    finally:
        if session:
            await session.close()


async def main() -> None:
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
    host = os.getenv("RITHMIC_GATEWAY_HOST", DEFAULT_HOST)
    port = int(os.getenv("RITHMIC_GATEWAY_PORT", str(DEFAULT_PORT)))
    async with websockets.serve(handle_browser, host, port):
        LOGGER.info("OpenBackTest Rithmic gateway listening on ws://%s:%s", host, port)
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
