const equity = 9958.14;
const positionValue = 1 * 59958.14 * 1;
const marginBlowoutPercent = 5;
const marginRequired = positionValue * (marginBlowoutPercent / 100);

console.log('equity:', equity);
console.log('marginRequired:', marginRequired);
console.log('equity <= marginRequired:', equity <= marginRequired);

const marginBlowoutPercent100 = 100;
const marginRequired100 = positionValue * (marginBlowoutPercent100 / 100);
console.log('marginRequired100:', marginRequired100);
console.log('equity <= marginRequired100:', equity <= marginRequired100);
