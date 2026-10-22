export function FormMessage({
  error,
  success,
}: {
  error?: string | null;
  success?: string | null;
}) {
  if (error)
    return (
      <p
        role="alert"
        className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
      >
        {error}
      </p>
    );
  if (success)
    return (
      <p
        role="status"
        className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
      >
        {success}
      </p>
    );
  return null;
}
