type Props = {
  error?: string;
  success?: string;
};

export function Feedback({ error, success }: Props) {
  if (!error && !success) return null;
  return (
    <div className="px-6">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg bg-green-50 border border-green-200 text-green-700 px-4 py-3 text-sm">
          {success}
        </div>
      )}
    </div>
  );
}
