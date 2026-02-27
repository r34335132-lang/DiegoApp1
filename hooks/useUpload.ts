import { useState, useCallback } from "react";
import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";
import { getApiUrl } from "@/lib/query-client";

export type UploadResult = {
  url: string;
  mimeType: string;
  isVideo: boolean;
};

export type UploadState = {
  uploading: boolean;
  progress: number;
  error: string | null;
  result: UploadResult | null;
};

function safeExtFromMime(mimeType: string): string {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("mov")) return "mov";
  if (mimeType.includes("avi")) return "avi";
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("video")) return "mp4";
  if (mimeType.includes("gif")) return "gif";
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  return "jpg";
}

function generateSafeFilename(mimeType: string, originalName?: string | null): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).substring(2, 7);

  if (originalName && typeof originalName === "string" && originalName.length > 0) {
    const dotIdx = originalName.lastIndexOf(".");
    if (dotIdx > 0) {
      const ext = originalName.substring(dotIdx + 1).replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
      if (ext.length > 0 && ext.length <= 5) return `upload_${ts}_${rand}.${ext}`;
    }
  }
  return `upload_${ts}_${rand}.${safeExtFromMime(mimeType)}`;
}

async function uriToBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  if (!response.ok) throw new Error(`No se pudo leer el archivo (${response.status})`);
  const blob = await response.blob();
  console.log("[useUpload] Blob leído:", { size: blob.size, type: blob.type });
  return blob;
}

export function useUpload() {
  const [state, setState] = useState<UploadState>({
    uploading: false,
    progress: 0,
    error: null,
    result: null,
  });

  const reset = useCallback(() => {
    setState({ uploading: false, progress: 0, error: null, result: null });
  }, []);

  const upload = useCallback(async (
    uri: string,
    mimeType: string,
    originalName?: string | null,
  ): Promise<UploadResult | null> => {
    if (!uri || typeof uri !== "string" || uri.length === 0) {
      const err = "URI de archivo inválido";
      setState({ uploading: false, progress: 0, error: err, result: null });
      console.warn("[useUpload] URI inválido:", uri);
      return null;
    }

    const safeFileName = generateSafeFilename(mimeType, originalName);
    const isVideo = mimeType.startsWith("video/") ||
      safeFileName.endsWith(".mp4") ||
      safeFileName.endsWith(".mov") ||
      safeFileName.endsWith(".avi");

    console.log("[useUpload] Iniciando subida:", { uri: uri.slice(0, 80), mimeType, safeFileName, isVideo });

    setState({ uploading: true, progress: 0, error: null, result: null });

    try {
      const baseUrl = getApiUrl();
      const uploadUrl = new URL("/api/upload", baseUrl).toString();
      console.log("[useUpload] URL de subida:", uploadUrl);

      let blob: Blob;
      try {
        blob = await uriToBlob(uri);
      } catch (blobErr: any) {
        console.warn("[useUpload] Blob falló, usando método nativo:", blobErr.message);
        if (Platform.OS === "web") {
          throw new Error("No se pudo leer el archivo en web: " + blobErr.message);
        }
        return await new Promise<UploadResult | null>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", uploadUrl);
          xhr.withCredentials = true;
          xhr.timeout = 120000;

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const pct = Math.round((e.loaded / e.total) * 100);
              setState(prev => ({ ...prev, progress: pct }));
            }
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const data = JSON.parse(xhr.responseText);
                const result: UploadResult = { url: data.url, mimeType, isVideo };
                console.log("[useUpload] Subida nativa exitosa:", result.url);
                setState({ uploading: false, progress: 100, error: null, result });
                resolve(result);
              } catch {
                const err = "Error al procesar respuesta del servidor";
                setState({ uploading: false, progress: 0, error: err, result: null });
                reject(new Error(err));
              }
            } else {
              let msg = "Error al subir el archivo";
              try { msg = JSON.parse(xhr.responseText).message || msg; } catch {}
              setState({ uploading: false, progress: 0, error: msg, result: null });
              reject(new Error(msg));
            }
          };
          xhr.onerror = () => {
            const err = "Error de conexión al subir";
            setState({ uploading: false, progress: 0, error: err, result: null });
            reject(new Error(err));
          };
          xhr.ontimeout = () => {
            const err = "Tiempo de espera agotado";
            setState({ uploading: false, progress: 0, error: err, result: null });
            reject(new Error(err));
          };

          const formData = new FormData();
          formData.append("file", { uri, name: safeFileName, type: mimeType } as any);
          console.log("[useUpload] Enviando FormData nativo, filename:", safeFileName);
          xhr.send(formData);
        });
      }

      return await new Promise<UploadResult | null>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", uploadUrl);
        xhr.withCredentials = true;
        xhr.timeout = 120000;

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            console.log("[useUpload] Progreso:", pct + "%");
            setState(prev => ({ ...prev, progress: pct }));
          }
        };

        xhr.onload = () => {
          console.log("[useUpload] Respuesta del servidor:", xhr.status, xhr.responseText.slice(0, 200));
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              const result: UploadResult = { url: data.url, mimeType, isVideo };
              console.log("[useUpload] Subida exitosa:", result.url, "| isVideo:", result.isVideo);
              setState({ uploading: false, progress: 100, error: null, result });
              resolve(result);
            } catch {
              const err = "Error al procesar respuesta";
              setState({ uploading: false, progress: 0, error: err, result: null });
              reject(new Error(err));
            }
          } else {
            let msg = "Error al subir el archivo";
            try { msg = JSON.parse(xhr.responseText).message || msg; } catch {}
            console.error("[useUpload] Fallo en subida:", xhr.status, msg);
            setState({ uploading: false, progress: 0, error: msg, result: null });
            reject(new Error(msg));
          }
        };

        xhr.onerror = () => {
          const err = "Error de conexión. Verifica tu red.";
          setState({ uploading: false, progress: 0, error: err, result: null });
          reject(new Error(err));
        };
        xhr.ontimeout = () => {
          const err = "Tiempo de espera agotado";
          setState({ uploading: false, progress: 0, error: err, result: null });
          reject(new Error(err));
        };

        const formData = new FormData();
        formData.append("file", blob, safeFileName);
        console.log("[useUpload] Enviando blob, size:", blob.size, "filename:", safeFileName);
        xhr.send(formData);
      });
    } catch (err: any) {
      const msg = err.message || "Error inesperado al subir";
      console.error("[useUpload] Excepción en subida:", msg);
      setState({ uploading: false, progress: 0, error: msg, result: null });
      return null;
    }
  }, []);

  const pickAndUpload = useCallback(async (
    mediaTypes: "images" | "videos" | "all" = "all",
  ): Promise<UploadResult | null> => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        const err = "Se requiere permiso para acceder a la galería";
        setState(prev => ({ ...prev, error: err }));
        console.warn("[useUpload] Permiso de galería denegado");
        return null;
      }

      const pickerTypes: ImagePicker.MediaType[] =
        mediaTypes === "images" ? ["images"] :
        mediaTypes === "videos" ? ["videos"] :
        ["images", "videos"];

      console.log("[useUpload] Abriendo galería con tipos:", pickerTypes);

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        quality: 0.85,
        allowsEditing: false,
        mediaTypes: pickerTypes,
      });

      if (pickerResult.canceled || !pickerResult.assets?.length) {
        console.log("[useUpload] Selección cancelada o sin assets");
        return null;
      }

      const asset = pickerResult.assets[0];
      console.log("[useUpload] Asset seleccionado:", {
        uri: asset.uri?.slice(0, 80),
        type: asset.type,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
        fileSize: asset.fileSize,
        duration: asset.duration,
      });

      if (!asset.uri) {
        setState(prev => ({ ...prev, error: "No se pudo obtener el archivo" }));
        return null;
      }

      const isVideoAsset = asset.type === "video" ||
        (asset.mimeType ? asset.mimeType.startsWith("video/") : false);
      const mimeType = asset.mimeType || (isVideoAsset ? "video/mp4" : "image/jpeg");

      return upload(asset.uri, mimeType, asset.fileName ?? null);
    } catch (err: any) {
      const msg = err.message || "Error al abrir la galería";
      console.error("[useUpload] Error en selector:", msg);
      setState({ uploading: false, progress: 0, error: msg, result: null });
      return null;
    }
  }, [upload]);

  const pickCameraAndUpload = useCallback(async (): Promise<UploadResult | null> => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        setState(prev => ({ ...prev, error: "Se requiere permiso para usar la cámara" }));
        return null;
      }

      const pickerResult = await ImagePicker.launchCameraAsync({
        quality: 0.85,
        mediaTypes: ["images"],
      });

      if (pickerResult.canceled || !pickerResult.assets?.length) return null;

      const asset = pickerResult.assets[0];
      if (!asset.uri) return null;

      const mimeType = asset.mimeType || "image/jpeg";
      return upload(asset.uri, mimeType, asset.fileName ?? null);
    } catch (err: any) {
      const msg = err.message || "Error al usar la cámara";
      setState({ uploading: false, progress: 0, error: msg, result: null });
      return null;
    }
  }, [upload]);

  return { ...state, upload, pickAndUpload, pickCameraAndUpload, reset };
}
