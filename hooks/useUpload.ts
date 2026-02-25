import { useState, useCallback } from "react";
import * as ImagePicker from "expo-image-picker";
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

  const upload = useCallback(async (uri: string, mimeType: string, fileName: string): Promise<UploadResult | null> => {
    setState({ uploading: true, progress: 0, error: null, result: null });
    try {
      const baseUrl = getApiUrl();
      const uploadUrl = new URL("/api/upload", baseUrl).toString();

      return await new Promise<UploadResult | null>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", uploadUrl);
        xhr.withCredentials = true;

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
              const isVideo = mimeType.startsWith("video/");
              const result: UploadResult = { url: data.url, mimeType, isVideo };
              setState({ uploading: false, progress: 100, error: null, result });
              resolve(result);
            } catch {
              const err = "Error al procesar respuesta";
              setState({ uploading: false, progress: 0, error: err, result: null });
              reject(new Error(err));
            }
          } else {
            let msg = "Error al subir";
            try { msg = JSON.parse(xhr.responseText).message || msg; } catch {}
            setState({ uploading: false, progress: 0, error: msg, result: null });
            reject(new Error(msg));
          }
        };

        xhr.onerror = () => {
          const err = "Error de conexión";
          setState({ uploading: false, progress: 0, error: err, result: null });
          reject(new Error(err));
        };

        const formData = new FormData();
        formData.append("file", { uri, name: fileName, type: mimeType } as any);
        xhr.send(formData);
      });
    } catch (err: any) {
      setState({ uploading: false, progress: 0, error: err.message, result: null });
      return null;
    }
  }, []);

  const pickAndUpload = useCallback(async (mediaTypes: "images" | "videos" | "all" = "all"): Promise<UploadResult | null> => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setState(prev => ({ ...prev, error: "Permiso de galería denegado" }));
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes,
      quality: 0.8,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets[0]) return null;

    const asset = result.assets[0];
    const mimeType = asset.mimeType || (mediaTypes === "videos" ? "video/mp4" : "image/jpeg");
    const isVideo = mimeType.startsWith("video/") || asset.type === "video";
    const ext = isVideo ? "mp4" : "jpg";
    const fileName = asset.fileName || `media_${Date.now()}.${ext}`;

    return upload(asset.uri, mimeType, fileName);
  }, [upload]);

  const pickCameraAndUpload = useCallback(async (): Promise<UploadResult | null> => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setState(prev => ({ ...prev, error: "Permiso de cámara denegado" }));
      return null;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) return null;

    const asset = result.assets[0];
    const mimeType = asset.mimeType || "image/jpeg";
    const fileName = asset.fileName || `photo_${Date.now()}.jpg`;

    return upload(asset.uri, mimeType, fileName);
  }, [upload]);

  return { ...state, upload, pickAndUpload, pickCameraAndUpload, reset };
}
