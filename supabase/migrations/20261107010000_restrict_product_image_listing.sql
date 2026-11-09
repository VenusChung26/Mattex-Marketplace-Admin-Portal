-- Public image URLs are served without a SELECT policy. Only the server needs
-- to enumerate objects; browsers must not be able to list this bucket.
alter policy product_images_public_read on storage.objects to service_role;
