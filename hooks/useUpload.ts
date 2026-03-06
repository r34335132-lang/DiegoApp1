import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
// ¡AQUÍ ESTÁ EL CAMBIO! Agregamos "/legacy" al final
import * as FileSystem from 'expo-file-system/legacy'; 
import { decode } from 'base64-arraybuffer';
import { supabase } from '@/lib/supabase';

export function useUpload() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const pickAndUpload = async (type: 'images' | 'videos') => {
    try {
      setError(null);
      // 1. Abrir la galería
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: type === 'images' ? ImagePicker.MediaTypeOptions.Images : ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: true,
        quality: 0.7, // Comprimimos un poco para que suba rápido
      });

      if (result.canceled || !result.assets[0]) return null;

      setUploading(true);
      setProgress(20);

      const asset = result.assets[0];
      const ext = asset.uri.split('.').pop() || (type === 'images' ? 'jpg' : 'mp4');
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
      const filePath = `${type}/${fileName}`; 

      // 2. Leer el archivo 
      const base64File = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: 'base64', 
      });
      setProgress(50);

      // 3. Subir a Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('media')
        .upload(filePath, decode(base64File), {
          contentType: type === 'images' ? `image/${ext}` : `video/${ext}`,
        });

      if (uploadError) throw uploadError;
      setProgress(100);

      // 4. Obtener la URL pública
      const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(filePath);

      return { url: publicUrl };
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error al subir el archivo');
      return null;
    } finally {
      setUploading(false);
    }
  };

  const reset = () => {
    setUploading(false);
    setProgress(0);
    setError(null);
  };

  return { uploading, progress, error, pickAndUpload, reset };
}