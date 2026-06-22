import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../services/supabase';

export interface AppConfig {
  voting_enabled: boolean;
  donating_enabled: boolean;
  nominations_enabled: boolean;
  maintenance_mode: boolean;
  maintenance_message: string;
}

interface AppConfigContextType {
  config: AppConfig;
  isAdmin: boolean;
  loading: boolean;
  refetch: () => Promise<void>;
}

const DEFAULT_CONFIG: AppConfig = {
  voting_enabled: true,
  donating_enabled: true,
  nominations_enabled: true,
  maintenance_mode: false,
  maintenance_message: "Fund-It is temporarily down for maintenance. We'll be back soon.",
};

const AppConfigContext = createContext<AppConfigContextType>({
  config: DEFAULT_CONFIG,
  isAdmin: false,
  loading: true,
  refetch: async () => {},
});

export function AppConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchConfig = async () => {
    try {
      const [configResult, authResult] = await Promise.all([
        supabase
          .from('app_config')
          .select('voting_enabled, donating_enabled, nominations_enabled, maintenance_mode, maintenance_message')
          .single(),
        supabase.auth.getUser(),
      ]);

      if (configResult.data) setConfig(configResult.data);

      const user = authResult.data.user;
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('user_id', user.id)
          .single();
        setIsAdmin(profile?.is_admin ?? false);
      } else {
        setIsAdmin(false);
      }
    } catch {
      // keep defaults on error
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchConfig();
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AppConfigContext.Provider value={{ config, isAdmin, loading, refetch: fetchConfig }}>
      {children}
    </AppConfigContext.Provider>
  );
}

export const useAppConfig = () => useContext(AppConfigContext);
