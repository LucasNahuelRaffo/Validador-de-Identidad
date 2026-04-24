export type Database = {
  public: {
    Tables: {
      validaciones: {
        Row: {
          id: string;
          token: string;
          nombre_cliente: string | null;
          dni: string | null;
          estado: "pendiente" | "aprobado" | "rechazado";
          similitud_facial: number | null;
          datos_dni: Record<string, string> | null;
          intentos: number | null;
          creado_en: string;
          actualizado_en: string;
        };
        Insert: {
          id?: string;
          token: string;
          nombre_cliente?: string | null;
          dni?: string | null;
          estado?: "pendiente" | "aprobado" | "rechazado";
          similitud_facial?: number | null;
          datos_dni?: Record<string, string> | null;
          intentos?: number | null;
          creado_en?: string;
          actualizado_en?: string;
        };
        Update: {
          id?: string;
          token?: string;
          nombre_cliente?: string | null;
          dni?: string | null;
          estado?: "pendiente" | "aprobado" | "rechazado";
          similitud_facial?: number | null;
          datos_dni?: Record<string, string> | null;
          intentos?: number | null;
          creado_en?: string;
          actualizado_en?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
