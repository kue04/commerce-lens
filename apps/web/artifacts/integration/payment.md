# 支付金额变化分析

> 合成数据；固定演示业务时钟。

报告：8f8d755e-eec1-4b83-8bb3-daa5b4383d7e；run：08c1f184-7eab-49bc-817e-931e5f727de5；session：31de8fbb-2f0e-494e-b4dc-334eb512e6be
生成时间：2026-10-22T13:17:55.063Z
问题：昨天华东支付金额为什么下降？
状态：completed；单位：fen（fen 为人民币分整数，units 为支付件数；null 表示不可计算或缺失，不等于 0）
模式：deterministic；Agent 执行：false
指标：支付金额；范围摘要：east · 全部商品
时区：Asia/Shanghai；数据水位：2026-10-21T16:00:00.000Z

## 分析口径
```json
{
  "topN": 10,
  "filters": {
    "regionId": [
      "east"
    ]
  },
  "groupBy": "sku",
  "metricId": "paid_amount",
  "currentWindow": {
    "startDate": "2026-10-21",
    "endDateExclusive": "2026-10-22"
  },
  "baselineWindow": {
    "startDate": "2026-10-14",
    "endDateExclusive": "2026-10-15"
  }
}
```

### 数据集
```json
{
  "version": "signals-v1",
  "timezone": "Asia/Shanghai",
  "storeName": "禾味食品演示店",
  "synthetic": true,
  "updatedAt": "2026-10-21T16:00:00.000Z",
  "businessClock": "2026-10-22"
}
```

### 版本与执行来源
```json
{
  "modelId": null,
  "agentExecuted": false,
  "executionMode": "deterministic",
  "metricVersion": "1.0.0",
  "promptVersion": "analysis-v2",
  "datasetVersion": "signals-v1",
  "contractVersion": "1.1.0"
}
```

## 总量与贡献
支付金额变化达到业务规则提示阈值，请核实。

原始总量（分/件及未舍入比例）：
```json
{
  "delta": -3000000,
  "current": 7000000,
  "baseline": 10000000,
  "changeRate": -0.3
}
```

原始贡献（负份额与超过 100% 的份额均保留；不同维度不相加）：
```json
[
  {
    "key": "A",
    "delta": -4000000,
    "label": "A",
    "share": 1.3333333333333333,
    "current": 2000000,
    "isOther": false,
    "baseline": 6000000,
    "changeRate": -0.6666666666666666
  },
  {
    "key": "B",
    "delta": 1000000,
    "label": "B",
    "share": -0.3333333333333333,
    "current": 5000000,
    "isOther": false,
    "baseline": 4000000,
    "changeRate": 0.25
  }
]
```

## 事实
- 支付金额由 100000.00 元 变为 70000.00 元，变化 -30000.00 元。 [8922292b-c50e-4b91-b713-9593027f3761]
  数值引用：comparison.baseline；comparison.current；comparison.delta
- A 支付金额变化 -40000.00 元。 [3f79f24a-62b5-4fd3-ac0f-206b72e7b428]
  数值引用：contributors.0.delta
- B 支付金额变化 10000.00 元。 [3f79f24a-62b5-4fd3-ac0f-206b72e7b428]
  数值引用：contributors.1.delta
- 被核查库存池（SKU：A；大区：east；大区共享，不区分渠道）本期观测 24/24 小时，零库存 10 小时；基期零库存 0 小时。 [ef9c6085-e527-499d-81f8-bc16f0558fdd]
  数值引用：signal.current；signal.baseline
- 已观测渠道与大区背景（渠道：全部；大区：east）会话数由 3000 变为 2100，不代表 SKU 流量。 [4b35e176-b4f3-4ba9-bf22-d9bb9153c34c]
  数值引用：signal.baseline.sessions；signal.current.sessions

## 可能解释
- 下降商品的零库存观测增加，与销售下降在时间上重叠，可能存在供应约束；不能证明全部下降由缺货造成。 [8922292b-c50e-4b91-b713-9593027f3761, ef9c6085-e527-499d-81f8-bc16f0558fdd, 3f79f24a-62b5-4fd3-ac0f-206b72e7b428]；反证引用：未提供；缺失信息：缺少曝光、需求与精确补货数据，无法估计因果损失。
- 同口径渠道流量下降与经营指标下降同时出现，支持流量相关解释；不能直接归因到单个 SKU。 [8922292b-c50e-4b91-b713-9593027f3761, 4b35e176-b4f3-4ba9-bf22-d9bb9153c34c]；反证引用：未提供；缺失信息：缺少 SKU 曝光和访问，尚不能证明因果。
- 在活动核查选择（SKU：全部；渠道：全部；含全范围活动，不支持大区归因）内发现与本期或基期窗口重叠的活动记录，需核实活动结束时间及影响；不能据此确定活动效果。 [8922292b-c50e-4b91-b713-9593027f3761, f50eebfb-58fa-49e8-b014-3f462fec1fe1]；反证引用：未提供；缺失信息：缺少活动曝光、价格和对照实验数据。

## 未知
- 可观测关联不能证明因果，无法估计因果损失。

## 建议核实
- 核实贡献较大的商品与渠道，补充相关源数据。

## 限制
- 合成食品电商数据；固定演示业务时钟。
- 贡献分解表示变化来源，相关性不等于因果。
- 确定性数据库分析模式，未执行 Agent 或调用模型。

## 证据
以下各证据保留自身 QuerySpec、两期窗口、筛选、列名、原始值、覆盖率、结构化信号、说明及 hash；证据子范围不等于报告总范围。库存是大区共享池，流量不支持 SKU 归因；活动不支持大区归因，退款原因仅描述本期成功退款分类。

### E01 支付金额周期比较（8922292b-c50e-4b91-b713-9593027f3761）
```json
{
  "id": "8922292b-c50e-4b91-b713-9593027f3761",
  "code": "E01",
  "kind": "comparison",
  "note": "支付按 paid_at；金额为分整数、件数不扣后续退款，绑定不可变版本。",
  "rows": [
    [
      7000000,
      10000000,
      -3000000,
      -0.3
    ]
  ],
  "query": {
    "topN": 10,
    "filters": {
      "regionId": [
        "east"
      ]
    },
    "groupBy": "none",
    "metricId": "paid_amount",
    "currentWindow": {
      "startDate": "2026-10-21",
      "endDateExclusive": "2026-10-22"
    },
    "baselineWindow": {
      "startDate": "2026-10-14",
      "endDateExclusive": "2026-10-15"
    }
  },
  "runId": "08c1f184-7eab-49bc-817e-931e5f727de5",
  "title": "支付金额周期比较",
  "source": "PostgreSQL 支付订单行聚合",
  "status": "success",
  "columns": [
    "本期（分）",
    "基期（分）",
    "变化（分）",
    "变化率"
  ],
  "coverage": 1,
  "metricId": "paid_amount",
  "createdAt": "2026-10-22T13:17:54.992Z",
  "comparison": {
    "delta": -3000000,
    "current": 7000000,
    "baseline": 10000000,
    "changeRate": -0.3
  },
  "resultHash": "920bf0d922845932113108bfb8d136170edd33708d32da8d5306f81f2d25e7f7",
  "hashAlgorithm": "sha256-canonical-json-v1",
  "metricVersion": "1.0.0",
  "datasetVersion": "signals-v1",
  "baselineCoverage": 1,
  "queryTemplateIds": [
    "aggregate-v1:paid_amount:none"
  ]
}
```

### E02 支付金额变化贡献（3f79f24a-62b5-4fd3-ac0f-206b72e7b428）
```json
{
  "id": "3f79f24a-62b5-4fd3-ac0f-206b72e7b428",
  "code": "E02",
  "kind": "contribution",
  "note": "支付按 paid_at；金额为分整数、件数不扣后续退款，绑定不可变版本。",
  "rows": [
    [
      "A",
      2000000,
      6000000,
      -4000000,
      1.3333333333333333
    ],
    [
      "B",
      5000000,
      4000000,
      1000000,
      -0.3333333333333333
    ]
  ],
  "query": {
    "topN": 10,
    "filters": {
      "regionId": [
        "east"
      ]
    },
    "groupBy": "sku",
    "metricId": "paid_amount",
    "currentWindow": {
      "startDate": "2026-10-21",
      "endDateExclusive": "2026-10-22"
    },
    "baselineWindow": {
      "startDate": "2026-10-14",
      "endDateExclusive": "2026-10-15"
    }
  },
  "runId": "08c1f184-7eab-49bc-817e-931e5f727de5",
  "title": "支付金额变化贡献",
  "source": "PostgreSQL 支付订单行聚合",
  "status": "success",
  "columns": [
    "分组",
    "本期（分）",
    "基期（分）",
    "变化（分）",
    "贡献份额"
  ],
  "coverage": 1,
  "metricId": "paid_amount",
  "createdAt": "2026-10-22T13:17:55.007Z",
  "comparison": {
    "delta": -3000000,
    "current": 7000000,
    "baseline": 10000000,
    "changeRate": -0.3
  },
  "resultHash": "a5e596ed5650465899722fc33cf19ea2bda543f5bc2478f8b93c693224507aa4",
  "contributors": [
    {
      "key": "A",
      "delta": -4000000,
      "label": "A",
      "share": 1.3333333333333333,
      "current": 2000000,
      "isOther": false,
      "baseline": 6000000,
      "changeRate": -0.6666666666666666
    },
    {
      "key": "B",
      "delta": 1000000,
      "label": "B",
      "share": -0.3333333333333333,
      "current": 5000000,
      "isOther": false,
      "baseline": 4000000,
      "changeRate": 0.25
    }
  ],
  "hashAlgorithm": "sha256-canonical-json-v1",
  "metricVersion": "1.0.0",
  "datasetVersion": "signals-v1",
  "baselineCoverage": 1,
  "queryTemplateIds": [
    "aggregate-v1:paid_amount:none",
    "aggregate-v1:paid_amount:sku"
  ]
}
```

### E03 inventory 核查（ef9c6085-e527-499d-81f8-bc16f0558fdd）
```json
{
  "id": "ef9c6085-e527-499d-81f8-bc16f0558fdd",
  "code": "E03",
  "kind": "inventory",
  "note": "大区共享库存池；小时为 SKU×大区观测数，不推断单渠道独享库存。覆盖不足 95% 不得声称全天未缺货。",
  "rows": [
    [
      "本期",
      24,
      24,
      10
    ],
    [
      "基期",
      24,
      24,
      0
    ]
  ],
  "query": {
    "topN": 10,
    "filters": {
      "skuId": [
        "A"
      ],
      "regionId": [
        "east"
      ]
    },
    "groupBy": "sku",
    "metricId": "paid_amount",
    "currentWindow": {
      "startDate": "2026-10-21",
      "endDateExclusive": "2026-10-22"
    },
    "baselineWindow": {
      "startDate": "2026-10-14",
      "endDateExclusive": "2026-10-15"
    }
  },
  "runId": "08c1f184-7eab-49bc-817e-931e5f727de5",
  "title": "inventory 核查",
  "signal": {
    "type": "inventory",
    "current": {
      "coverage": 1,
      "zeroHours": 10,
      "expectedHours": 24,
      "observedHours": 24
    },
    "baseline": {
      "coverage": 1,
      "zeroHours": 0,
      "expectedHours": 24,
      "observedHours": 24
    }
  },
  "source": "PostgreSQL inventory 受控查询",
  "status": "success",
  "columns": [
    "周期",
    "预期库存池小时",
    "已观测小时",
    "零库存小时"
  ],
  "coverage": 1,
  "metricId": "paid_amount",
  "createdAt": "2026-10-22T13:17:55.021Z",
  "resultHash": "35d96ebedb8740c263b336ef0c955acff3076e768f168bcad3282e49eb2c66d8",
  "metricVersion": "1.0.0",
  "datasetVersion": "signals-v1",
  "baselineCoverage": 1,
  "queryTemplateIds": [
    "signal-v1:inventory"
  ]
}
```

### E04 traffic 核查（4b35e176-b4f3-4ba9-bf22-d9bb9153c34c）
```json
{
  "id": "4b35e176-b4f3-4ba9-bf22-d9bb9153c34c",
  "code": "E04",
  "kind": "traffic",
  "note": "仅为渠道×大区背景，忽略 SKU 筛选，不支持 SKU 转化或归因；归因口径不匹配或覆盖不足时转化率为 null。",
  "rows": [
    [
      "本期",
      2100,
      1,
      0.0004761904761904762
    ],
    [
      "基期",
      3000,
      1,
      0.0003333333333333333
    ]
  ],
  "query": {
    "topN": 10,
    "filters": {
      "regionId": [
        "east"
      ]
    },
    "groupBy": "sku",
    "metricId": "paid_amount",
    "currentWindow": {
      "startDate": "2026-10-21",
      "endDateExclusive": "2026-10-22"
    },
    "baselineWindow": {
      "startDate": "2026-10-14",
      "endDateExclusive": "2026-10-15"
    }
  },
  "runId": "08c1f184-7eab-49bc-817e-931e5f727de5",
  "title": "traffic 核查",
  "signal": {
    "type": "traffic",
    "current": {
      "sessions": 2100,
      "conversion": 0.0004761904761904762,
      "paidOrders": 1
    },
    "baseline": {
      "sessions": 3000,
      "conversion": 0.0003333333333333333,
      "paidOrders": 1
    },
    "attributionMatched": true,
    "skuAttributionSupported": false
  },
  "source": "PostgreSQL traffic 受控查询",
  "status": "success",
  "columns": [
    "周期",
    "会话数",
    "同渠道大区支付订单数",
    "转化率"
  ],
  "coverage": 1,
  "metricId": "paid_amount",
  "createdAt": "2026-10-22T13:17:55.034Z",
  "resultHash": "0e18ddc1375b09653a4a676e4b74ddda25bb7a155bffd04681c421f60b6d1154",
  "metricVersion": "1.0.0",
  "datasetVersion": "signals-v1",
  "baselineCoverage": 1,
  "queryTemplateIds": [
    "signal-v1:traffic"
  ]
}
```

### E05 promotion 核查（f50eebfb-58fa-49e8-b014-3f462fec1fe1）
```json
{
  "id": "f50eebfb-58fa-49e8-b014-3f462fec1fe1",
  "code": "E05",
  "kind": "promotion",
  "note": "按 SKU/渠道选择匹配活动，包含全范围活动；活动无大区粒度，不支持大区归因。与本期或基期窗口重叠仅为时间佐证，不能推断活动增量或结束造成的销售损失。",
  "rows": [
    [
      "promotion-A",
      "2026-10-09T16:00:00.000Z",
      "2026-10-20T16:00:00.000Z",
      "discount_ended"
    ]
  ],
  "query": {
    "topN": 10,
    "filters": {
      "regionId": [
        "east"
      ]
    },
    "groupBy": "sku",
    "metricId": "paid_amount",
    "currentWindow": {
      "startDate": "2026-10-21",
      "endDateExclusive": "2026-10-22"
    },
    "baselineWindow": {
      "startDate": "2026-10-14",
      "endDateExclusive": "2026-10-15"
    }
  },
  "runId": "08c1f184-7eab-49bc-817e-931e5f727de5",
  "title": "promotion 核查",
  "signal": {
    "type": "promotion",
    "campaigns": [
      {
        "id": "promotion-A",
        "endAt": "2026-10-20T16:00:00.000Z",
        "startAt": "2026-10-09T16:00:00.000Z",
        "eventType": "discount_ended"
      }
    ]
  },
  "source": "PostgreSQL promotion 受控查询",
  "status": "success",
  "columns": [
    "活动",
    "开始",
    "结束",
    "事件类型"
  ],
  "coverage": 1,
  "metricId": "paid_amount",
  "createdAt": "2026-10-22T13:17:55.044Z",
  "resultHash": "a9248acdd5b4143e19907c0fe6c371f2ed2616be18e3cc156a4f20d587778924",
  "metricVersion": "1.0.0",
  "datasetVersion": "signals-v1",
  "baselineCoverage": 1,
  "queryTemplateIds": [
    "signal-v1:promotion"
  ]
}
```

## 执行记录
```json
[
  {
    "name": "compare_metric",
    "params": "{\"metricId\":\"paid_amount\",\"currentWindow\":{\"startDate\":\"2026-10-21\",\"endDateExclusive\":\"2026-10-22\"},\"baselineWindow\":{\"startDate\":\"2026-10-14\",\"endDateExclusive\":\"2026-10-15\"},\"filters\":{\"regionId\":[\"east\"]},\"groupBy\":\"none\",\"topN\":10}",
    "status": "success",
    "durationMs": 14.038100000005215,
    "evidenceId": "8922292b-c50e-4b91-b713-9593027f3761"
  },
  {
    "name": "decompose_change",
    "params": "{\"metricId\":\"paid_amount\",\"currentWindow\":{\"startDate\":\"2026-10-21\",\"endDateExclusive\":\"2026-10-22\"},\"baselineWindow\":{\"startDate\":\"2026-10-14\",\"endDateExclusive\":\"2026-10-15\"},\"filters\":{\"regionId\":[\"east\"]},\"groupBy\":\"sku\",\"topN\":10}",
    "status": "success",
    "durationMs": 11.90549999999348,
    "evidenceId": "3f79f24a-62b5-4fd3-ac0f-206b72e7b428"
  },
  {
    "name": "inspect_signals",
    "params": "{\"signalType\":\"inventory\",\"query\":{\"metricId\":\"paid_amount\",\"currentWindow\":{\"startDate\":\"2026-10-21\",\"endDateExclusive\":\"2026-10-22\"},\"baselineWindow\":{\"startDate\":\"2026-10-14\",\"endDateExclusive\":\"2026-10-15\"},\"filters\":{\"regionId\":[\"east\"],\"skuId\":[\"A\"]},\"groupBy\":\"sku\",\"topN\":10}}",
    "status": "success",
    "durationMs": 11.050199999997858,
    "evidenceId": "ef9c6085-e527-499d-81f8-bc16f0558fdd"
  },
  {
    "name": "inspect_signals",
    "params": "{\"signalType\":\"traffic\",\"query\":{\"metricId\":\"paid_amount\",\"currentWindow\":{\"startDate\":\"2026-10-21\",\"endDateExclusive\":\"2026-10-22\"},\"baselineWindow\":{\"startDate\":\"2026-10-14\",\"endDateExclusive\":\"2026-10-15\"},\"filters\":{\"regionId\":[\"east\"]},\"groupBy\":\"sku\",\"topN\":10}}",
    "status": "success",
    "durationMs": 10.602500000008149,
    "evidenceId": "4b35e176-b4f3-4ba9-bf22-d9bb9153c34c"
  },
  {
    "name": "inspect_signals",
    "params": "{\"signalType\":\"promotion\",\"query\":{\"metricId\":\"paid_amount\",\"currentWindow\":{\"startDate\":\"2026-10-21\",\"endDateExclusive\":\"2026-10-22\"},\"baselineWindow\":{\"startDate\":\"2026-10-14\",\"endDateExclusive\":\"2026-10-15\"},\"filters\":{\"regionId\":[\"east\"]},\"groupBy\":\"sku\",\"topN\":10}}",
    "status": "success",
    "durationMs": 8.05250000001979,
    "evidenceId": "f50eebfb-58fa-49e8-b014-3f462fec1fe1"
  },
  {
    "name": "submit_report",
    "params": "{\"comparisonEvidenceId\":\"8922292b-c50e-4b91-b713-9593027f3761\",\"contributionEvidenceId\":\"3f79f24a-62b5-4fd3-ac0f-206b72e7b428\",\"signalEvidenceIds\":[\"ef9c6085-e527-499d-81f8-bc16f0558fdd\",\"4b35e176-b4f3-4ba9-bf22-d9bb9153c34c\",\"f50eebfb-58fa-49e8-b014-3f462fec1fe1\"]}",
    "status": "success",
    "durationMs": 9.065600000001723
  }
]
```
