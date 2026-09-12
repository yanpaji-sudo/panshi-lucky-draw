const express = require("express");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

// 后台管理员 Token
// 部署到 Render 后，建议在 Environment Variables 里面设置
const ADMIN_TOKEN =
  process.env.ADMIN_TOKEN || "change-this-admin-token";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 前台静态文件
app.use(express.static(path.join(__dirname, "public")));

/*
|--------------------------------------------------------------------------
| 奖项配置
|--------------------------------------------------------------------------
|
| weight = 权重
| stock = 库存
| enabled = 是否启用
|
| 实际概率：
|
| 当前奖项权重 ÷ 所有可抽奖奖项权重 × 100%
|
*/

let prizes = [
  {
    id: 1,
    name: "谢谢惠顾",
    image: "🎁",
    weight: 55,
    stock: 999999,
    enabled: true
  },
  {
    id: 2,
    name: "¥18.8 优惠券",
    image: "🎟️",
    weight: 20,
    stock: 500,
    enabled: true
  },
  {
    id: 3,
    name: "¥28.8 优惠券",
    image: "🎟️",
    weight: 12,
    stock: 300,
    enabled: true
  },
  {
    id: 4,
    name: "¥58.8 优惠券",
    image: "💰",
    weight: 7,
    stock: 100,
    enabled: true
  },
  {
    id: 5,
    name: "¥88.8 优惠券",
    image: "💎",
    weight: 4,
    stock: 50,
    enabled: true
  },
  {
    id: 6,
    name: "积分 ×188",
    image: "⭐",
    weight: 2,
    stock: 1000,
    enabled: true
  }
];

/*
|--------------------------------------------------------------------------
| 抽奖记录
|--------------------------------------------------------------------------
*/

let drawLogs = [];

/*
|--------------------------------------------------------------------------
| 已经参加过抽奖的用户
|--------------------------------------------------------------------------
*/

let users = new Set();

/*
|--------------------------------------------------------------------------
| 后台权限验证
|--------------------------------------------------------------------------
*/

function adminAuth(req, res, next) {
  const token = req.headers["x-admin-token"];

  if (!token || token !== ADMIN_TOKEN) {
    return res.status(401).json({
      success: false,
      message: "无权限访问"
    });
  }

  next();
}

/*
|--------------------------------------------------------------------------
| 获取公开奖项
|--------------------------------------------------------------------------
*/

app.get("/api/prizes", (req, res) => {
  const activePrizes = prizes.filter(
    (p) =>
      p.enabled &&
      Number(p.weight) > 0 &&
      Number(p.stock) > 0
  );

  const totalWeight = activePrizes.reduce(
    (sum, p) => sum + Number(p.weight),
    0
  );

  const result = prizes
    .filter((p) => p.enabled)
    .map((p) => {
      let probability = 0;

      if (
        totalWeight > 0 &&
        Number(p.weight) > 0 &&
        Number(p.stock) > 0
      ) {
        probability =
          Number(
            (
              (Number(p.weight) / totalWeight) *
              100
            ).toFixed(2)
          );
      }

      return {
        id: p.id,
        name: p.name,
        image: p.image,
        stock: p.stock,
        probability
      };
    });

  res.json({
    success: true,
    prizes: result
  });
});

/*
|--------------------------------------------------------------------------
| 权重随机算法
|--------------------------------------------------------------------------
*/

function weightedRandom(list) {
  const totalWeight = list.reduce(
    (sum, item) => sum + Number(item.weight),
    0
  );

  if (totalWeight <= 0) {
    return null;
  }

  let random = Math.random() * totalWeight;

  for (const item of list) {
    random -= Number(item.weight);

    if (random < 0) {
      return item;
    }
  }

  return list[list.length - 1];
}

/*
|--------------------------------------------------------------------------
| 用户抽奖
|--------------------------------------------------------------------------
*/

app.post("/api/draw", (req, res) => {
  const userId = String(
    req.body.userId || ""
  ).trim();

  // 检查参与编号
  if (!userId) {
    return res.status(400).json({
      success: false,
      message: "请输入参与编号"
    });
  }

  // 限制长度
  if (userId.length > 100) {
    return res.status(400).json({
      success: false,
      message: "参与编号过长"
    });
  }

  // 检查是否已经抽过
  if (users.has(userId)) {
    return res.status(400).json({
      success: false,
      message: "该参与编号已经抽过奖"
    });
  }

  /*
   * 筛选可以抽取的奖项
   */

  const available = prizes.filter(
    (p) =>
      p.enabled &&
      Number(p.weight) > 0 &&
      Number(p.stock) > 0
  );

  if (!available.length) {
    return res.status(400).json({
      success: false,
      message: "当前暂无可抽奖奖项"
    });
  }

  /*
   * 根据权重随机选择奖项
   */

  const prize = weightedRandom(available);

  if (!prize) {
    return res.status(400).json({
      success: false,
      message: "抽奖失败"
    });
  }

  /*
   * 扣减库存
   *
   * 999999 视为无限库存
   */

  if (Number(prize.stock) < 999999) {
    prize.stock--;

    if (prize.stock < 0) {
      prize.stock = 0;
    }
  }

  /*
   * 标记用户已经抽奖
   */

  users.add(userId);

  /*
   * 创建抽奖记录
   */

  const log = {
    id: drawLogs.length + 1,
    userId: userId,
    prizeId: prize.id,
    prizeName: prize.name,
    time: new Date().toISOString()
  };

  drawLogs.unshift(log);

  /*
   * 返回中奖结果
   */

  res.json({
    success: true,
    result: {
      id: prize.id,
      name: prize.name,
      image: prize.image
    }
  });
});

/*
|--------------------------------------------------------------------------
| 后台：获取奖项配置
|--------------------------------------------------------------------------
*/

app.get(
  "/api/admin/prizes",
  adminAuth,
  (req, res) => {
    res.json({
      success: true,
      prizes
    });
  }
);

/*
|--------------------------------------------------------------------------
| 后台：保存奖项配置
|--------------------------------------------------------------------------
*/

app.put(
  "/api/admin/prizes",
  adminAuth,
  (req, res) => {
    const newPrizes = req.body.prizes;

    if (!Array.isArray(newPrizes)) {
      return res.status(400).json({
        success: false,
        message: "奖项数据格式错误"
      });
    }

    prizes = newPrizes.map(
      (p, index) => ({
        id:
          Number(p.id) ||
          Date.now() + index,

        name:
          String(
            p.name || "未命名奖项"
          ),

        image:
          String(
            p.image || "🎁"
          ),

        weight:
          Math.max(
            0,
            Number(p.weight) || 0
          ),

        stock:
          Math.max(
            0,
            Number(p.stock) || 0
          ),

        enabled:
          Boolean(p.enabled)
      })
    );

    res.json({
      success: true,
      message: "保存成功",
      prizes
    });
  }
);

/*
|--------------------------------------------------------------------------
| 后台：获取抽奖记录
|--------------------------------------------------------------------------
*/

app.get(
  "/api/admin/logs",
  adminAuth,
  (req, res) => {
    res.json({
      success: true,
      logs: drawLogs
    });
  }
);

/*
|--------------------------------------------------------------------------
| 后台：统计数据
|--------------------------------------------------------------------------
*/

app.get(
  "/api/admin/stats",
  adminAuth,
  (req, res) => {
    const totalDraws =
      drawLogs.length;

    const totalUsers =
      users.size;

    const statistics = {};

    for (const log of drawLogs) {
      if (
        !statistics[
          log.prizeName
        ]
      ) {
        statistics[
          log.prizeName
        ] = 0;
      }

      statistics[
        log.prizeName
      ]++;
    }

    res.json({
      success: true,
      totalDraws,
      totalUsers,
      statistics
    });
  }
);

/*
|--------------------------------------------------------------------------
| 健康检查
|--------------------------------------------------------------------------
*/

app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "ok",
    time: new Date().toISOString()
  });
});

/*
|--------------------------------------------------------------------------
| 前台首页
|--------------------------------------------------------------------------
*/

app.get("/", (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      "public",
      "index.html"
    )
  );
});

/*
|--------------------------------------------------------------------------
| 后台管理页面
|--------------------------------------------------------------------------
*/

app.get("/admin", (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      "public",
      "admin.html"
    )
  );
});

/*
|--------------------------------------------------------------------------
| 启动服务器
|--------------------------------------------------------------------------
*/

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `磐石甄选幸运转轮已经启动，端口：${PORT}`
    );
  }
);
