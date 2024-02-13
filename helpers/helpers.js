function padTo2Digits(num) {
    return num.toString().padStart(2, '0');
}

export function ifdef(value, options){
    return value !== undefined;
}

export function not(value, options){
    return !value;
}

export function eq(val1, val2, options) {
    return val1 === val2;
}

export function money(val, options) {
    return parseFloat(val).toLocaleString(undefined, { style: 'currency', currency: 'BYN' });;
}
export function formatDate(val, options) {
    return [
        padTo2Digits(val.getDate()),
        padTo2Digits(val.getMonth() + 1),
        val.getFullYear(),
    ].join('.');
}
export function multiply(val1, val2, options) {
    return (val1 * val2).toFixed(2)
}