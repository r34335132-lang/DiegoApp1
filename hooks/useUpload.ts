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
    const cleaned = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
    if (cleaned.includes(".")) return `${ts}_${rand}_${cleaned}`;
    return `${ts}_${rand}_${cleaned}.${safeExtFromMime(mimeType)}`;
  }

  return `upload_${ts}_${rand}.${safeExtFromMime(mimeType)}`;
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

  const upload = useCallback(async (uri: string, mimeType: string, originalName?: string | null): Promise<UploadResult | null> => {
    if (!uri || typeof uri !== "string" || uri.length === 0) {
      const err = "URI de archivo inválido";
      setState({ uploading: false, progress: 0, error: err, result: null });
      console.warn("[useUpload] Invalid URI:", uri);
      return null;
    }

    const safeFileName = generateSafeFilename(mimeType, originalName);
    const isVideo = mimeType.startsWith("video/") || safeFileName.endsWith(".mp4") || safeFileName.endsWith(".mov");

    console.log("[useUpload] Uploading file:", { uri: uri.slice(0, 60), mimeType, safeFileName, isVideo });

    setState({ uploading: true, progress: 0, error: null, result: null });

    try {
      const baseUrl = getApiUrl();
      const uploadUrl = new URL("/api/upload", baseUrl).toString();
      console.log("[useUpload] Upload URL:", uploadUrl);

      return await new Promise<UploadResult | null>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", uploadUrl);
        xhr.withCredentials = true;

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            console.log("[useUpload] Progress:", pct + "%");
            setState(prev => ({ ...prev, progress: pct }));
          }
        };

        xhr.onload = () => {
          console.log("[useUpload] Response status:", xhr.status, "body:", xhr.responseText.slice(0, 200));
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              const result: UploadResult = { url: data.url, mimeType, isVideo };
              console.log("[useUpload] Upload success:", result.url);
              setState({ uploading: false, progress: 100, error: null, result });
              resolve(result);
            } catch {
              const err = "Error al procesar respuesta del servidor";
              console.error("[useUpload] JSON parse error");
              setState({ uploading: false, progress: 0, error: err, result: null });
              reject(new Error(err));
            }
          } else {
            let msg = "Error al subir el archivo";
            try { msg = JSON.parse(xhr.responseText).message || msg; } catch {}
            console.error("[useUpload] Upload failed:", xhr.status, msg);
            setState({ uploading: false, progress: 0, error: msg, result: null });
            reject(new Error(msg));
          }
        };

        xhr.onerror = () => {
          const err = "Error de conexión. Verifica tu red.";
          console.error("[useUpload] Network error");
          setState({ uploading: false, progress: 0, error: err, result: null });
          reject(new Error(err));
        };

        xhr.ontimeout = () => {
          const err = "Tiempo de espera agotado";
          console.error("[useUpload] Timeout");
          setState({ uploading: false, progress: 0, error: err, result: null });
          reject(new Error(err));
        };

        xhr.timeout = 60000;

        const formData = new FormData();
        formData.append("file", { uri, name: safeFileName, type: mimeType } as any);
        console.log("[useUpload] Sending FormData with filename:", safeFileName);
        xhr.send(formData);
      });
    } catch (err: any) {
      const msg = err.message || "Error inesperado";
      console.error("[useUpload] Upload exception:", msg);
      setState({ uploading: false, progress: 0, error: msg, result: null });
      return null;
    }
  }, []);

  const pickAndUpload = useCallback(async (mediaTypes: "images" | "videos" | "all" = "all"): Promise<UploadResult | null> => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        const err = "Se requiere permiso para acceder a la galería";
        setState(prev => ({ ...prev, error: err }));
        console.warn("[useUpload] Gallery permission denied");
        return null;
      }

      const pickerOptions: ImagePicker.ImagePickerOptions = {
        quality: 0.82,
        allowsEditing: false,
        mediaTypes: mediaTypes === "images"
          ? ["images"]
          : mediaTypes === "videos"
            ? ["videos"]
            : ["images", "videos"],
      };

      console.log("[useUpload] Launching image picker with options:", JSON.stringify(pickerOptions));

      const pickerResult = await ImagePicker.launchImageLibraryAsync(pickerOptions);

      if (pickerResult.canceled || !pickerResult.assets || pickerResult.assets.length === 0) {
        console.log("[useUpload] Picker cancelled or no assets");
        return null;
      }

      const asset = pickerResult.assets[0];
      console.log("[useUpload] Picked asset:", {
        uri: asset.uri?.slice(0, 80),
        type: asset.type,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
        fileSize: asset.fileSize,
        duration: asset.duration,
      });

      if (!asset.uri) {
        const err = "No se pudo obtener el archivo seleccionado";
        setState(prev => ({ ...prev, error: err }));
        console.error("[useUpload] Asset has no URI");
        return null;
      }

      const isVideo = asset.type === "video" || (asset.mimeType ? asset.mimeType.startsWith("video/") : false);
      const mimeType = asset.mimeType || (isVideo ? "video/mp4" : "image/jpeg");

      return upload(asset.uri, mimeType, asset.fileName ?? null);

    } catch (err: any) {
      const msg = err.message || "Error al abrir la galería";
      console.error("[useUpload] Picker error:", msg);
      setState({ uploading: false, progress: 0, error: msg, result: null });
      return null;
    }
  }, [upload]);

  const pickCameraAndUpload = useCallback(async (): Promise<UploadResult | null> => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        const err = "Se requiere permiso para usar la cámara";
        setState(prev => ({ ...prev, error: err }));
        return null;
      }

      const pickerResult = await ImagePicker.launchCameraAsync({
        quality: 0.82,
        mediaTypes: ["images"],
      });

      if (pickerResult.canceled || !pickerResult.assets || pickerResult.assets.length === 0) {
        return null;
      }

      const asset = pickerResult.assets[0];
      console.log("[useUpload] Camera asset:", {
        uri: asset.uri?.slice(0, 80),
        mimeType: asset.mimeType,
        fileName: asset.fileName,
      });

      if (!asset.uri) {
        setState(prev => ({ ...prev, error: "No se pudo capturar la foto" }));
        return null;
      }

      const mimeType = asset.mimeType || "image/jpeg";
      return upload(asset.uri, mimeType, asset.fileName ?? null);

    } catch (err: any) {
      const msg = err.message || "Error al usar la cámara";
      console.error("[useUpload] Camera error:", msg);
      setState({ uploading: false, progress: 0, error: msg, result: null });
      return null;
    }
  }, [upload]);

  return { ...state, upload, pickAndUpload, pickCameraAndUpload, reset };
}
