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