# Issue tracker：本地 Markdown

本專案工作票使用 repository 內的 Markdown 檔案。建立、讀取、分流或更新工作票時，使用此本地 tracker。

## 位置與格式

- 每個工作主題一個目錄：`.scratch/<feature-slug>/`。
- 規格入口為該目錄的 `spec.md`。已有正式規格時，這裡放導覽連結，以正式規格為單一來源。
- 每張實作票獨立存於 `issues/<NN>-<slug>.md`，由 `01` 起按相依次序編號；不將所有票合併在同一檔案。
- 每票包含 `What to build`、`Blocked by`、`Status` 及可驗收的核取項目。票的描述以買家或銷售得到的結果為主。
- 討論與驗證結果附在各票底部的 `## Comments`。

## 狀態與阻塞

- Triage 名稱以 [triage-labels.md](triage-labels.md) 為準；已具備執行所需規格的票使用 `ready-for-agent`。
- `ready-for-agent` 不代表可以忽略阻塞票。只有所有 `Blocked by` 指定的票都完成，才可開始該票。
- `Blocked by` 使用同一主題內的票號及標題；沒有阻塞票時明確標示可立即開始。
- 完成全部驗收後，將 `Status` 改為 `done`，並在 Comments 記錄驗證結果。`done` 是完成狀態，不是 triage label。
- 各票檔案是狀態的權威來源；索引或圖表供導覽，不能代替讀取票的當前狀態。

## Skill 操作

- 「發佈到 tracker」：在對應主題的 `issues/` 下建立一個票檔；發佈本身不會開始實作。
- 「讀取工作票」：按使用者提供的主題、票號或路徑讀取該票，連同其 Comments 與阻塞票狀態。
- 「可開工集合」：內容齊備、尚未完成，且全部阻塞票已完成的票；沒有阻塞票可先開始。

本次主題為 `.scratch/catalog-selection/`，已批准 8 張工作票。
