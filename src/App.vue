<script setup>
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useLotteryStore } from './stores/lottery'
import TrendChart from './components/charts/TrendChart.vue'
import FrequencyChart from './components/charts/FrequencyChart.vue'
import SumTrendChart from './components/charts/SumTrendChart.vue'
import Chart3D from './components/charts/Chart3D.vue'
import Combination3DChart from './components/charts/Combination3DChart.vue'
import UpDownChart from './components/charts/UpDownChart.vue'
import OddEvenChart from './components/charts/OddEvenChart.vue'
import PredictionPanel from './components/PredictionPanel.vue'
import BacktestPanel from './components/BacktestPanel.vue'
import FilterPanel from './components/FilterPanel.vue'
import DrawTable from './components/DrawTable.vue'

const store = useLotteryStore()
const {
  loading,
  error,
  limit,
  chronDraws,
  latestDraws,
  latestDraw,
  positionFrequency,
  combinationFrequency,
  nextPrediction,
  sumSeries,
  typeStats,
} = storeToRefs(store)

onMounted(() => store.loadData())
</script>

<template>
  <div class="app">
    <header class="header">
      <div class="header-main">
        <div class="logo">
          <span class="logo-icon">🎱</span>
          <div>
            <h1>福彩3D 数据可视化</h1>
            <p class="subtitle">走势分析 · 号码统计 · 3D 分布</p>
          </div>
        </div>
        <div class="header-actions">
          <select v-model="limit" class="limit-select" @change="store.loadData(limit)">
            <option :value="50">最近 50 期</option>
            <option :value="100">最近 100 期</option>
            <option :value="500">最近 500 期</option>
            <option :value="1000">最近 1000 期</option>
            <option :value="3000">最近 3000 期</option>
            <option :value="5000">最近 5000 期</option>
            <option :value="8000">最近 8000 期</option>
            <option :value="10000">最近 10000 期</option>
          </select>
          <button class="btn-refresh" :disabled="loading" @click="store.loadData(limit)">
            {{ loading ? '加载中…' : '刷新数据' }}
          </button>
        </div>
      </div>

      <div v-if="latestDraw" class="latest-bar">
        <div class="latest-item">
          <span class="label">最新期号</span>
          <span class="value">{{ latestDraw.issue }}</span>
        </div>
        <div class="latest-item">
          <span class="label">开奖日期</span>
          <span class="value">{{ latestDraw.kjdate }}</span>
        </div>
        <div class="latest-item">
          <span class="label">开奖号码</span>
          <span class="latest-nums">
            <span v-for="(n, i) in latestDraw.digits" :key="i" class="ball">{{ n }}</span>
          </span>
        </div>
        <div class="latest-item">
          <span class="label">和值</span>
          <span class="value accent">{{ latestDraw.sum }}</span>
        </div>
        <div class="latest-item">
          <span class="label">形态</span>
          <span class="value">{{ latestDraw.type }}</span>
        </div>
      </div>
    </header>

    <PredictionPanel v-if="!loading && nextPrediction" :prediction="nextPrediction" />

    <div v-if="error" class="error-banner">{{ error }}</div>

    <main v-if="!loading && chronDraws.length" class="dashboard">
      <section class="stats-row">
        <div class="stat-card">
          <span class="stat-num">{{ chronDraws.length }}</span>
          <span class="stat-label">分析期数</span>
        </div>
        <div class="stat-card">
          <span class="stat-num">{{ typeStats['豹子'] }}</span>
          <span class="stat-label">豹子</span>
        </div>
        <div class="stat-card">
          <span class="stat-num">{{ typeStats['组三'] }}</span>
          <span class="stat-label">组三</span>
        </div>
        <div class="stat-card">
          <span class="stat-num">{{ typeStats['组六'] }}</span>
          <span class="stat-label">组六</span>
        </div>
      </section>

      <section class="chart-grid">
        <article class="card card-wide">
          <h2>条件筛选号码</h2>
          <p class="card-desc">在 000–999 全部号码中，按形态、奇偶比、上下形态、和值范围组合筛选</p>
          <FilterPanel :draws="chronDraws" />
        </article>

        <article class="card">
          <h2>号码走势图</h2>
          <p class="card-desc">百位、十位、个位号码随期号变化趋势</p>
          <TrendChart :draws="chronDraws" />
        </article>

        <article class="card">
          <h2>和值走势</h2>
          <p class="card-desc">三位号码之和的变化曲线</p>
          <SumTrendChart :sum-series="sumSeries" />
        </article>

        <article class="card">
          <h2>号码出现频率</h2>
          <p class="card-desc">各位置 0-9 号码出现次数对比</p>
          <FrequencyChart :position-frequency="positionFrequency" />
        </article>

        <article class="card">
          <h2>3D 频率分布</h2>
          <p class="card-desc">位置 × 号码 × 出现次数三维柱状图（百位金色、十位青色、个位紫色，频次越高颜色越亮）</p>
          <Chart3D :position-frequency="positionFrequency" />
        </article>

        <article class="card">
          <h2>000–999 组合频率 3D 图</h2>
          <p class="card-desc">所有三位数组合（000–999）的出现次数，柱高即频次；鼠标拖拽旋转，滚轮缩放</p>
          <Combination3DChart :combination-frequency="combinationFrequency" />
        </article>

        <article class="card">
          <h2>上下形态分布</h2>
          <p class="card-desc">0–4 记「上」，5–9 记「下」，三位共 8 种形态 · 含预测概率与遗漏期数</p>
          <UpDownChart :draws="chronDraws" />
        </article>

        <article class="card">
          <h2>奇偶比预测概率</h2>
          <p class="card-desc">三位中「奇数 : 偶数」的四种组合分布 · 含预测概率与遗漏期数</p>
          <OddEvenChart :draws="chronDraws" />
        </article>

        <article class="card card-wide">
          <h2>历史回测</h2>
          <p class="card-desc">选择训练区间与预测跨度，验证模型在历史数据上的实际命中率</p>
          <BacktestPanel :draws="chronDraws" />
        </article>

        <article class="card card-wide">
          <h2>开奖记录</h2>
          <p class="card-desc">最近 50 期开奖明细</p>
          <DrawTable :draws="latestDraws" />
        </article>
      </section>
    </main>

    <div v-else-if="loading" class="loading-state">
      <div class="spinner" />
      <p>正在加载开奖数据…</p>
    </div>
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  background: var(--bg);
}

.header {
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
  border-bottom: 1px solid #334155;
  padding: 28px 32px 0;
}

.header-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
  margin-bottom: 24px;
}

.logo {
  display: flex;
  align-items: center;
  gap: 16px;
}

.logo-icon {
  font-size: 40px;
}

.logo h1 {
  margin: 0;
  font-size: 28px;
  color: #f8fafc;
  letter-spacing: -0.5px;
}

.subtitle {
  margin: 4px 0 0;
  color: #64748b;
  font-size: 14px;
}

.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.limit-select {
  background: #1e293b;
  border: 1px solid #475569;
  color: #e2e8f0;
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
}

.btn-refresh {
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  color: #1c1917;
  border: none;
  padding: 8px 20px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  transition: opacity 0.2s, transform 0.15s;
}

.btn-refresh:hover:not(:disabled) {
  transform: translateY(-1px);
}

.btn-refresh:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.latest-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  padding: 16px 0 20px;
  border-top: 1px solid #334155;
}

.latest-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.latest-item .label {
  font-size: 12px;
  color: #64748b;
}

.latest-item .value {
  font-size: 16px;
  font-weight: 600;
  color: #e2e8f0;
}

.latest-item .value.accent {
  color: #fbbf24;
  font-size: 20px;
}

.latest-nums {
  display: flex;
  gap: 6px;
}

.ball {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(145deg, #fbbf24, #f59e0b);
  color: #1c1917;
  font-weight: 700;
  font-size: 16px;
  box-shadow: 0 2px 8px rgba(251, 191, 36, 0.4);
}

.error-banner {
  margin: 16px 32px;
  padding: 12px 16px;
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  color: #f87171;
  text-align: center;
}

.dashboard {
  padding: 24px 32px 48px;
  max-width: 1400px;
  margin: 0 auto;
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
  text-align: center;
}

.stat-num {
  display: block;
  font-size: 32px;
  font-weight: 700;
  color: #fbbf24;
  line-height: 1.2;
}

.stat-label {
  font-size: 13px;
  color: var(--text);
  margin-top: 4px;
}

.chart-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
}

.card {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 20px 24px 16px;
}

.card-wide {
  grid-column: 1 / -1;
}

.card h2 {
  margin: 0 0 4px;
  font-size: 18px;
  color: var(--text-h);
  text-align: left;
}

.card-desc {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--text);
  text-align: left;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 80px 20px;
  color: var(--text);
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border);
  border-top-color: #fbbf24;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 900px) {
  .header { padding: 20px 16px 0; }
  .dashboard { padding: 16px; }
  .chart-grid { grid-template-columns: 1fr; }
  .logo h1 { font-size: 22px; }
}
</style>
