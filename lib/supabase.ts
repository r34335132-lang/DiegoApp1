import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Reemplaza estas variables con las de tu proyecto en Supabase (Settings -> API)
const supabaseUrl = 'https://mqhnorrauipjdwjqkcsf.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xaG5vcnJhdWlwamR3anFrY3NmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MzUwNTMsImV4cCI6MjA4ODMxMTA1M30.NM50elEIk8G61JTf2KhFQb3tWPVfMdB3RFLBhelJW8o';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});