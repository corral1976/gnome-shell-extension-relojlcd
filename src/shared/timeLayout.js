export function buildSeparator(char, condensed) {
    return condensed ? char : ` ${char} `;
}

export function buildDateDivider(condensed) {
    return condensed ? ' - ' : '  --  ';
}
