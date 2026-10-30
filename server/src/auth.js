import jwt from "jsonwebtoken";

export function requireAuth(request, response, next) {
  const authorization = request.get("authorization") || "";
  const token = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
  if (!token) return response.status(401).json({ error: "Authentication required." });

  try {
    request.user = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch {
    return response.status(401).json({ error: "Invalid or expired session." });
  }
}

export function requireRole(...roles) {
  return (request, response, next) => {
    if (!roles.includes(request.user?.role)) {
      return response.status(403).json({ error: "Access denied." });
    }
    return next();
  };
}
