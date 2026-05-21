export type DeepTranslate<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? readonly DeepTranslate<U>[]
    : T extends object
      ? { [K in keyof T]: DeepTranslate<T[K]> }
      : T;
