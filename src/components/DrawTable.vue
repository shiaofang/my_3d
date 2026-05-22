<script setup>
defineProps({
  draws: { type: Array, default: () => [] },
})

const TYPE_CLASS = {
  豹子: 'type-leopard',
  组三: 'type-pair',
  组六: 'type-normal',
}
</script>

<template>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>期号</th>
          <th>日期</th>
          <th>开奖号码</th>
          <th>和值</th>
          <th>跨度</th>
          <th>形态</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="draw in draws.slice(0, 50)" :key="draw.issue">
          <td class="issue">{{ draw.issue }}</td>
          <td class="date">{{ draw.kjdate }}</td>
          <td class="nums">
            <span v-for="(n, i) in draw.digits" :key="i" class="ball">{{ n }}</span>
          </td>
          <td>{{ draw.sum }}</td>
          <td>{{ draw.span }}</td>
          <td>
            <span class="type-tag" :class="TYPE_CLASS[draw.type]">{{ draw.type }}</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.table-wrap {
  overflow-x: auto;
  border-radius: 12px;
  border: 1px solid var(--border);
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

th,
td {
  padding: 10px 14px;
  text-align: center;
  border-bottom: 1px solid var(--border);
}

th {
  background: rgba(251, 191, 36, 0.08);
  color: var(--text-h);
  font-weight: 600;
  position: sticky;
  top: 0;
}

tbody tr:hover {
  background: rgba(251, 191, 36, 0.04);
}

.issue {
  font-family: var(--mono);
  color: var(--text-h);
}

.date {
  color: var(--text);
  font-size: 13px;
}

.nums {
  display: flex;
  justify-content: center;
  gap: 6px;
}

.ball {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: linear-gradient(145deg, #fbbf24, #f59e0b);
  color: #1c1917;
  font-weight: 700;
  font-size: 14px;
  box-shadow: 0 2px 6px rgba(251, 191, 36, 0.35);
}

.type-tag {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
}

.type-leopard {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
}

.type-pair {
  background: rgba(251, 191, 36, 0.15);
  color: #fbbf24;
}

.type-normal {
  background: rgba(52, 211, 153, 0.12);
  color: #34d399;
}
</style>
