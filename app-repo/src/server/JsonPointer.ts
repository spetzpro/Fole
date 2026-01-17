
export class JsonPointer {
  
  private static unescape(token: string): string {
    return token.replace(/~1/g, "/").replace(/~0/g, "~");
  }

  static getByPointer(obj: any, pointer: string): any {
    if (obj === undefined || obj === null) return undefined;
    if (pointer === "") return obj;
    if (!pointer.startsWith("/")) return undefined; // Invalid pointer syntax

    const tokens = pointer.split("/").slice(1);
    let current = obj;

    for (const token of tokens) {
      if (current === undefined || current === null) return undefined;
      const key = this.unescape(token);
      // Array handling: if current is array and key is number or "-"
      // For MVP simple property access is enough, but robust handling checks types.
      // JS objects allow string access usually even for arrays (e.g. "0").
      current = current[key];
    }

    return current;
  }

  static setByPointer(obj: any, pointer: string, value: any): void {
    if (obj === undefined || obj === null) return;
    if (pointer === "") return; // Cannot set root
    if (!pointer.startsWith("/")) return;

    const tokens = pointer.split("/").slice(1);
    if (tokens.length === 0) return;

    let current = obj;
    // Traverse until second to last
    for (let i = 0; i < tokens.length - 1; i++) {
        const token = this.unescape(tokens[i]);
        if (current[token] === undefined || current[token] === null) {
            // Auto-create object if missing
            current[token] = {};
        }
        current = current[token];
    }

    const lastToken = this.unescape(tokens[tokens.length - 1]);
    current[lastToken] = value;
  }
}
