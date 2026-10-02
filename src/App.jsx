import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default function App() {
  const [estado, setEstado] = useState("Verificando conexión…");

  useEffect(() => {
    fetch(`${SUPABASE_URL}/auth/v1/health`, { headers: { apikey: SUPABASE_ANON_KEY } })
      .then((r) => setEstado(r.ok ? "Conectado a Supabase" : `Error ${r.status}`))
      .catch(() => setEstado("Sin conexión con Supabase"));
  }, []);

  return (
    <div style={{ height: "100%", display: "grid", placeItems: "center", textAlign: "center" }}>
      <div>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", color: "#b08d4f", letterSpacing: ".12em" }}>
          HOTEL CONCIERGE
        </h1>
        <p>{estado}</p>
      </div>
    </div>
  );
}
