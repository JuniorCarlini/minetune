/** GB com uma casa abaixo de 10 GB (4.5), sem casa acima (32): igual nas três línguas, para mensagens. */
export function gigabytesText(bytes: number): string {
  const value = bytes / 1024 ** 3;
  return value < 10 ? value.toFixed(1) : value.toFixed(0);
}
