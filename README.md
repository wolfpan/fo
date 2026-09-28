# 般若藏 · The Prajña Gallery

佛教禅宗经典阅读网站——以顶级美术馆之陈设，呈四部经典：**般若波罗蜜多心经**、**金刚经**、**六祖坛经**、**楞伽经**。深色、简约、禅意。

![tech](https://img.shields.io/badge/Node.js-Express-green) ![fonts](https://img.shields.io/badge/字体-行书%20%2F%20正楷-blue)

## 特性

- **四部经典全文**（约 8.5 万字）：心经全卷（玄奘译）、金刚经三十二分（鸠摩罗什译）、坛经十品（宗宝本）、楞伽经四卷（求那跋陀罗译），底本出自维基文库《大正藏》
- **美术馆式陈列**：犍陀罗与北朝（北魏/北齐）造像配图、藏品编号、展签式元数据、名句引文
- **竖排古籍阅读**：从右向左、小号句读嵌于前字右肩、列顶对齐、卷末"止观"收尾
- **双字体系统**：马善政行书（默认）↔ 霞鹜文楷正楷，一键切换、本地分片加载
- **梵音背景乐**：Web Audio 实时合成五曲（晨钟/颂钵/空山/梵音/夜雨），含佛教钟声，无限循环
- 阅读进度、字号调节、章节目录、阅读位置记忆
- **AI 说禅 · 曹溪影**：依《坛经》蒸馏人格的流式问答；经文引用全部来自本站语料检索，经证卡片深链竖排阅读页；Neon Postgres (pgvector) + BGE-M3 混合检索。M2 起「参学簿」记忆：话头/画像/问答摘要，回访承接，一键焚簿（默认关闭、显式开启）

## 运行

```bash
npm install   # 含 postinstall：自动从 npm 包部署分片字体
npm start     # http://localhost:3000
```

## 结构

```
server.js            Express 服务 + 经典数据 API + 问禅路由挂载
data/sutras.json     四部经典全文（build-data.cjs 装配）
data/raw/            维基文库抓取与解析的中间产物
public/              前端（首页、阅读页、梵音引擎、字体切换、问禅面板）
zen/                 AI 说禅：compile 人格资产 / 服务端模块 / 测试 / 配置模板
scripts/             字体部署、索引建库脚本
```

### AI 说禅（曹溪影）启用步骤

```bash
cp zen/config.example.json zen/config.json   # 填写主对话模型 / Neon 连接串 / 百炼嵌入 Key
node scripts/build-zen-index.cjs --dry       # 离线试跑：只分块看统计
node scripts/build-zen-index.cjs             # 正式建库（BGE-M3 嵌入 → 灌 Neon）
node zen/test/recall.cjs                     # 在线验收：golden set recall@5 ≥ 80%
npm start                                    # 首页/阅读页右下角点灯即问
```

## 数据来源

经文：Wikisource（T235 / T251 / T2008 / T670）；造像图版：公刊博物馆藏品影像，仅作陈列之用。
