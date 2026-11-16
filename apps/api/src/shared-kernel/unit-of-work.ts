// Runs a piece of work atomically: every repository call made inside `work` takes part in the
// same transaction, committed when `work` resolves and rolled back when it throws.
// A run started inside another run joins the outer one. If the outer run catches an inner
// failure, the inner writes are not undone (there is no savepoint): only the outermost run rolls back.
export abstract class UnitOfWork {
  abstract run<T>(work: () => Promise<T>): Promise<T>;
}
