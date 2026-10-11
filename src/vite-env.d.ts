/**
 * 本仓库用到的构建期变量的类型声明。
 *
 * `BMM_VARIANT` 由 vite.config.ts 的 `define` 注入（构建时从环境变量读），
 * 所以这里必须声明它，否则 `import.meta.env.BMM_VARIANT` 通不过 tsc。
 */
interface ImportMetaEnv {
  /** 'full'（默认）或 'workshop'（创意工坊版） */
  readonly BMM_VARIANT?: 'full' | 'workshop';
  /** vite 内置：开发模式标记 */
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
