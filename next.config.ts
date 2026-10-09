import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Plano de contas e regras viraram abas de Configurações; links antigos continuam valendo.
  redirects() {
    return [
      { source: "/plano-de-contas", destination: "/configuracoes", permanent: false },
      { source: "/regras", destination: "/configuracoes/regras", permanent: false },
    ];
  },
};

export default nextConfig;
