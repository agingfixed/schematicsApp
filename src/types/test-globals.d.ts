declare module 'node:test' {
  type TestFn = (t: unknown) => void | Promise<void>;
  const test: {
    (name: string, fn: TestFn): void;
    (fn: TestFn): void;
  };
  export default test;
}

declare module 'node:assert/strict' {
  const assert: {
    (value: unknown, message?: string | Error): asserts value;
    ok(value: unknown, message?: string | Error): asserts value;
    strictEqual<T>(actual: T, expected: T, message?: string | Error): void;
    deepStrictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    throws(fn: (...args: unknown[]) => unknown, expected?: unknown, message?: string | Error): void;
    fail(message?: string | Error): never;
  } & Record<string, unknown>;
  export default assert;
}

declare interface ImportMetaEnv {
  readonly DEV?: boolean;
}

declare interface ImportMeta {
  readonly env?: ImportMetaEnv;
}
