export class Result<T, E = Error> {
  private constructor(
    private readonly _ok: boolean,
    private readonly _value?: T,
    private readonly _error?: E,
  ) {}

  static ok<T, E = Error>(value: T): Result<T, E> {
    return new Result<T, E>(true, value);
  }
  static fail<T, E = Error>(error: E): Result<T, E> {
    return new Result<T, E>(false, undefined, error);
  }

  get isOk(): boolean {
    return this._ok;
  }
  get isFail(): boolean {
    return !this._ok;
  }
  get value(): T {
    if (!this._ok) throw new Error('Cannot read value of a failed Result');
    return this._value as T;
  }
  get error(): E {
    if (this._ok) throw new Error('Cannot read error of an ok Result');
    return this._error as E;
  }
  getOrThrow(): T {
    if (!this._ok) throw this._error;
    return this._value as T;
  }
}
