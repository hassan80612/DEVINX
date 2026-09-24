-- Private storage buckets for DevinX Loja.
-- Files are copied separately before cutover; no public access is enabled.

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values
  ('partner-order-files','partner-order-files',false,3145728,array['image/jpeg','image/png','image/webp']),
  ('partner-store-media','partner-store-media',false,5242880,array['image/jpeg','image/png','image/webp','image/avif'])
on conflict(id) do update set
  name=excluded.name,
  public=excluded.public,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;
