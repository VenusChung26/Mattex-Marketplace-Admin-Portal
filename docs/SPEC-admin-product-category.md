# Spec — Product Category admin page

Products third tab: **Mattex Products | Product Category | Mattex Chain Products**.

- Add / rename / delete categories (seed and custom). Delete only when **count is 0**, including Trash products. The last remaining category cannot be deleted.
- Disabled Delete shows a **visible hover tooltip** (not native `title`): why it cannot delete (products still assigned, or last category).
- List shows **count** (includes Trash). Click a category to see its products.
- Each product row has an **open** icon → Mattex Products **Edit** for that SKU.
- One product, one category. Select products and **Move** to another category. **Add products** searches the rest of the catalog and assigns them here.
- Do **not** leave a product with no category.
- Trash rows are grey and read-only (no move, no Publish). Restore on Mattex Products → Trash.
- Product add/edit form still has Category dropdown **and Add category**.

```jsx
// ❌ BAD
deleteAdminCategory(categoryWithProducts.id);
assignAdminProductsCategory(ids, "");

// ✅ GOOD
<button disabled={category.count > 0 || categories.length <= 1}>Delete</button>
assignAdminProductsCategory(ids, otherCategoryName);
```
