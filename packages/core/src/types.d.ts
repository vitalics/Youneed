/** A value that may be returned synchronously or as a promise. */
export type MaybePromise<T> = T | Promise<T>;
/** A concrete, newable class. */
export type Constructor<T = object> = new (...args: any[]) => T;
/** A class that may be `abstract` — accepts both `class X {}` and `abstract class X {}`. */
export type AbstractConstructor<T = object> = abstract new (...args: any[]) => T;
/** Either constructor form — anything you'd key class-level metadata by. */
export type AnyConstructor<T = object> = Constructor<T> | AbstractConstructor<T>;
