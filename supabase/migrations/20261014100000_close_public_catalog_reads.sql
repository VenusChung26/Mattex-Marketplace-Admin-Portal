-- Close anonymous reads on catalog tables. Applied on the project database.
--
-- Why: `products.payload` holds the full product (refPrice, deliveryFee, sourceUrl, import notes in remark).
-- `suppliers` and `supplier_metrics` hold rating, completion rate, on-time rate, search and RFQ counts.
-- Anyone with the public anon key could read all of it through the Supabase REST API.
--
-- Safe because: the app has no browser-side Supabase client (no supabase-js under src/), and every read
-- goes through /api/* with the service role, which bypasses RLS. The public output is filtered in
-- server/public-catalog.js. Rating stays public through /api/catalog, not through these tables.
--
-- Rollback: recreate the policies below.
--   create policy products_read on public.products for select to anon, authenticated using (true);
--   create policy product_images_read on public.product_images for select to anon, authenticated using (true);
--   create policy suppliers_read on public.suppliers for select to public using (true);
--   create policy metrics_read on public.supplier_metrics for select to public using (true);

drop policy if exists products_read on public.products;
drop policy if exists product_images_read on public.product_images;
drop policy if exists suppliers_read on public.suppliers;
drop policy if exists metrics_read on public.supplier_metrics;

-- Leave storage.objects policy `product_images_public_read` in place until the 133 files in the
-- `product-images` bucket are copied to Blob and every reference is updated (S3). Then:
--   drop policy if exists product_images_public_read on storage.objects;
--   and delete the bucket after verification.
