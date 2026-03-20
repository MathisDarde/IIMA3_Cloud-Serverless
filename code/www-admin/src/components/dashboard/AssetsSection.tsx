import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import type { Asset } from "../../types";

type Props = {
  token: string;
  taskId: number;
  onUnauthorized: () => void;
};

function formatBytes(bytes: number | null) {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AssetsSection({ token, taskId, onUnauthorized }: Props) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadAssets();
  }, [taskId]);

  async function loadAssets() {
    setLoading(true);
    setError("");
    try {
      const data = await api.assets.list(token, taskId);
      setAssets(data.assets);
    } catch (err: any) {
      if (err?.status === 401) { onUnauthorized(); return; }
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError("");
    try {
      const { presign_url, presign_fields } = await api.assets.upload(token, taskId, {
        filename: file.name,
        content_type: file.type || "application/octet-stream",
        size_bytes: file.size,
      });

      const formData = new FormData();
      Object.entries(presign_fields).forEach(([k, v]) => formData.append(k, v));
      formData.append("file", file);

      await fetch(presign_url, { method: "POST", body: formData, mode: "no-cors" });

      await loadAssets();
    } catch (err: any) {
      if (err?.status === 401) { onUnauthorized(); return; }
      setError(err instanceof Error ? err.message : "Erreur lors de l'upload");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleDelete(asset: Asset) {
    if (!confirm(`Supprimer "${asset.filename}" ?`)) return;
    try {
      await api.assets.delete(token, asset.id);
      setAssets((prev) => prev.filter((a) => a.id !== asset.id));
    } catch (err: any) {
      if (err?.status === 401) { onUnauthorized(); return; }
      setError(err instanceof Error ? err.message : "Erreur");
    }
  }

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-700">Fichiers</h4>
        <label className={`text-xs bg-gray-900 hover:bg-gray-700 text-white font-medium px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
          {uploading ? "Upload..." : "+ Ajouter"}
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
        </label>
      </div>

      {error && (
        <div className="mb-3 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-xs text-gray-400 py-2 text-center">Chargement...</p>
      ) : assets.length === 0 ? (
        <p className="text-xs text-gray-400 py-2 text-center">Aucun fichier.</p>
      ) : (
        <div className="space-y-2">
          {assets.map((asset) => (
            <div
              key={asset.id}
              className="flex items-center justify-between px-3 py-2 rounded-lg border border-gray-100"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{asset.filename}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {formatBytes(asset.size_bytes)} · {asset.content_type ?? "fichier"}
                </p>
              </div>
              <div className="flex gap-2 shrink-0 ml-3">
                <a
                  href={asset.download_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-gray-900 hover:text-gray-800 font-medium border border-gray-200 px-2 py-1 rounded-lg"
                >
                  Télécharger
                </a>
                <button
                  onClick={() => handleDelete(asset)}
                  className="text-xs text-red-600 hover:text-red-800 font-medium border border-red-200 px-2 py-1 rounded-lg"
                >
                  Supprimer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
