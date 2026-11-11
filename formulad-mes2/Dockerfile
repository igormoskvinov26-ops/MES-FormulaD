# FormulaD MES 2.0 — multi-stage build (T-108)
# Usage: docker build -t formulad-mes .
#        docker compose -f docker/docker-compose.yml up -d

# --- Stage 1: build backend ---
FROM mcr.microsoft.com/dotnet/sdk:10.0-preview AS backend
WORKDIR /src
COPY src/FormulaD.Mes.Api/FormulaD.Mes.Api.csproj src/FormulaD.Mes.Api/
COPY fixtures/ fixtures/
RUN dotnet restore src/FormulaD.Mes.Api/FormulaD.Mes.Api.csproj
COPY src/ src/
RUN dotnet publish src/FormulaD.Mes.Api/FormulaD.Mes.Api.csproj -c Release -o /app --no-restore

# --- Stage 2: build frontend ---
FROM node:22-slim AS frontend
WORKDIR /web
COPY apps/web/package.json apps/web/package-lock.json* ./
RUN npm ci --ignore-scripts
COPY apps/web/ .
RUN npm run build

# --- Stage 3: runtime ---
FROM mcr.microsoft.com/dotnet/aspnet:10.0-preview
WORKDIR /app
COPY --from=backend /app .
COPY --from=frontend /web/dist wwwroot/

ENV ASPNETCORE_URLS=http://+:5080
EXPOSE 5080

ENTRYPOINT ["dotnet", "FormulaD.Mes.Api.dll"]
