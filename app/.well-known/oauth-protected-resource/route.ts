/**
 * GET /.well-known/oauth-protected-resource
 *
 * Dieselben Metadaten ohne Pfad. Manche Clients fragen zuerst hier, wenn
 * sie den Hinweis aus dem 401 nicht auswerten. Die App hat nur eine
 * geschützte Ressource, also gibt es keinen Widerspruch.
 */
export { GET, OPTIONS } from "./api/mcp/route";
