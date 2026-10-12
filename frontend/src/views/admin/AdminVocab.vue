<template>
  <div class="card" style="margin-bottom:0">
    <div class="toolbar">
      <el-select v-model="query.levelId" placeholder="全部关卡" clearable style="width:180px" @change="reload">
        <el-option v-for="lv in levels" :key="lv.id" :label="`第${lv.sortNo}关 · ${lv.name}`" :value="lv.id" />
      </el-select>
      <el-input
        v-model="query.keyword" placeholder="搜索单词 / 释义" clearable style="width:220px"
        :prefix-icon="Search" @keyup.enter="reload" @clear="reload"
      />
      <el-button type="primary" :icon="Search" @click="reload">查询</el-button>
      <div style="flex:1"></div>
      <span class="muted" style="margin-right:10px">共 {{ total }} 题</span>
      <el-button :icon="Grid" @click="openLevelDialog">关卡管理</el-button>
      <el-button :icon="UploadFilled" @click="openImport">批量导入</el-button>
      <el-button type="primary" :icon="Plus" @click="openCreate">新增题目</el-button>
    </div>

    <el-table :data="list" v-loading="loading" stripe style="width:100%">
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column label="关卡" width="110">
        <template #default="{ row }">
          <el-tag size="small" type="info">{{ levelName(row.levelId) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="题型" width="90">
        <template #default="{ row }">
          <el-tag size="small" :type="row.type === 'SPELL' ? 'warning' : 'primary'">
            {{ row.type === 'SPELL' ? '拼写' : '单选' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="word" label="单词" width="150" />
      <el-table-column prop="meaning" label="中文释义" min-width="140" />
      <el-table-column label="选项" min-width="220">
        <template #default="{ row }">
          <span class="muted" style="font-size:12px">
            A.{{ row.optionA }} / B.{{ row.optionB }}<template v-if="row.optionC"> / C.{{ row.optionC }}</template
            ><template v-if="row.optionD"> / D.{{ row.optionD }}</template>
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="answer" label="答案" width="80">
        <template #default="{ row }">
          <b style="color:var(--eq-success)">{{ row.answer }}</b>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <el-tag size="small" :type="row.status === 1 ? 'success' : 'info'">
            {{ row.status === 1 ? '启用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" link @click="openEdit(row)">编辑</el-button>
          <el-button size="small" type="danger" link @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div style="display:flex;justify-content:flex-end;margin-top:16px">
      <el-pagination
        v-model:current-page="query.pageNum" v-model:page-size="query.pageSize"
        :total="total" :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next" background @change="load"
      />
    </div>

    <!-- 新增 / 编辑 -->
    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑题目' : '新增题目'" width="560px">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="90px">
        <el-form-item label="所属关卡" prop="levelId">
          <el-select v-model="form.levelId" placeholder="请选择关卡" style="width:100%">
            <el-option v-for="lv in levels" :key="lv.id" :label="`第${lv.sortNo}关 · ${lv.name}`" :value="lv.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="题型" prop="type">
          <el-radio-group v-model="form.type">
            <el-radio-button value="CHOICE">单选</el-radio-button>
            <el-radio-button value="SPELL">拼写</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="单词" prop="word">
          <el-input v-model="form.word" placeholder="如 abandon" clearable />
        </el-form-item>
        <el-form-item label="中文释义" prop="meaning">
          <el-input v-model="form.meaning" placeholder="如 放弃；抛弃" clearable />
        </el-form-item>
        <template v-if="form.type === 'CHOICE'">
          <el-form-item label="选项 A" prop="optionA"><el-input v-model="form.optionA" /></el-form-item>
          <el-form-item label="选项 B" prop="optionB"><el-input v-model="form.optionB" /></el-form-item>
          <el-form-item label="选项 C"><el-input v-model="form.optionC" /></el-form-item>
          <el-form-item label="选项 D"><el-input v-model="form.optionD" /></el-form-item>
          <el-form-item label="正确答案" prop="answer">
            <el-radio-group v-model="form.answer">
              <el-radio-button value="A">A</el-radio-button>
              <el-radio-button value="B">B</el-radio-button>
              <el-radio-button value="C">C</el-radio-button>
              <el-radio-button value="D">D</el-radio-button>
            </el-radio-group>
          </el-form-item>
        </template>
        <el-form-item label="解析">
          <el-input v-model="form.analysis" type="textarea" :rows="2" placeholder="选填，答题后可展示" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="form.status" :active-value="1" :inactive-value="0" active-text="启用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <!-- 批量导入：选关卡 -> 传文件 -> 解析预览 -> 确认入库 -->
    <el-dialog v-model="importDialog" title="批量导入词汇" width="780px" @closed="resetImport">
      <el-alert type="info" :closable="false" show-icon style="margin-bottom:16px">
        <template #title>
          支持 .xlsx / .xls / .csv。表头必须有「单词」「中文释义」两列；
          <b>选项 A~D 可以全部留空</b>，留空时系统会自动从题库已有的释义里挑 3 个当干扰项并随机决定正确项位置。
        </template>
      </el-alert>

      <el-form label-width="88px">
        <el-form-item label="目标关卡" required>
          <el-select v-model="imp.levelId" placeholder="请选择要导入的关卡" style="width:100%">
            <el-option v-for="lv in levels" :key="lv.id" :label="`第${lv.sortNo}关 · ${lv.name}`" :value="lv.id" />
          </el-select>
          <div class="muted tip">同一关卡里已存在的单词会自动跳过，不会重复导入。</div>
        </el-form-item>

        <el-form-item label="默认题型">
          <el-radio-group v-model="imp.defaultType">
            <el-radio-button value="CHOICE">单选</el-radio-button>
            <el-radio-button value="SPELL">拼写</el-radio-button>
          </el-radio-group>
          <span class="muted tip" style="margin-left:12px">文件里「题型」列留空时按这里算</span>
        </el-form-item>

        <el-form-item label="选择文件">
          <div style="width:100%">
            <el-upload
              ref="uploadRef"
              drag
              :auto-upload="false"
              :limit="1"
              accept=".xlsx,.xls,.csv"
              :on-change="onFileChange"
              :on-exceed="onFileExceed"
            >
              <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
              <div class="el-upload__text">把文件拖到这里，或 <em>点击选择文件</em></div>
              <template #tip>
                <div class="el-upload__tip">
                  单个文件不超过 5MB、单次不超过 500 行。
                  <el-button link type="primary" :icon="Download" @click="downloadTemplate">下载 CSV 模板</el-button>
                </div>
              </template>
            </el-upload>
            <div class="muted tip">
              想少填几格就只写「单词 + 中文释义」两列；想自己定干扰项就把选项 A~D 和正确答案一起填上
              （此时正确答案那一项的文字必须与「中文释义」一致）。拼写题不用填选项。
            </div>
          </div>
        </el-form-item>
      </el-form>

      <!-- 解析结果 -->
      <template v-if="imp.result">
        <el-divider content-position="left">
          {{ imp.result.dryRun ? '解析结果（尚未写入题库）' : '导入结果' }}
        </el-divider>

        <div class="imp-stats">
          <span class="imp-stat">文件数据行 <b>{{ imp.result.total }}</b></span>
          <span class="imp-stat ok">可导入 <b>{{ imp.result.insertable }}</b></span>
          <span v-if="!imp.result.dryRun" class="imp-stat ok">已写入 <b>{{ imp.result.inserted }}</b></span>
          <span class="imp-stat skip">跳过重复 <b>{{ imp.result.skipped }}</b></span>
          <span class="imp-stat bad">失败 <b>{{ imp.result.failed }}</b></span>
        </div>

        <div v-if="imp.result.preview?.length" class="imp-block">
          <div class="imp-block-title">前 {{ imp.result.preview.length }} 行预览</div>
          <el-table :data="imp.result.preview" size="small" stripe max-height="240">
            <el-table-column prop="rowNo" label="行号" width="60" />
            <el-table-column label="题型" width="72">
              <template #default="{ row }">
                <el-tag size="small" :type="row.type === 'SPELL' ? 'warning' : 'primary'">
                  {{ row.type === 'SPELL' ? '拼写' : '单选' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="word" label="单词" width="120" />
            <el-table-column prop="meaning" label="中文释义" min-width="130" />
            <el-table-column label="选项" min-width="200">
              <template #default="{ row }">
                <span v-if="row.type === 'SPELL'" class="muted">—</span>
                <span v-else class="muted" style="font-size:12px">
                  A.{{ row.optionA }} / B.{{ row.optionB }} / C.{{ row.optionC }} / D.{{ row.optionD }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="答案" width="76">
              <template #default="{ row }">
                <b style="color:var(--eq-success)">{{ row.answer }}</b>
                <el-tag v-if="row.autoOptions" size="small" type="info" style="margin-left:4px">自动</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div v-if="imp.result.errors?.length" class="imp-block">
          <div class="imp-block-title bad">失败行（{{ imp.result.errors.length }}）：这些问题行不会入库</div>
          <el-table :data="imp.result.errors" size="small" max-height="180">
            <el-table-column prop="rowNo" label="行号" width="60" />
            <el-table-column prop="message" label="原因" />
          </el-table>
        </div>

        <div v-if="imp.result.skippedRows?.length" class="imp-block">
          <div class="imp-block-title skip">跳过行（{{ imp.result.skippedRows.length }}）</div>
          <el-table :data="imp.result.skippedRows" size="small" max-height="180">
            <el-table-column prop="rowNo" label="行号" width="60" />
            <el-table-column prop="message" label="原因" />
          </el-table>
        </div>
      </template>

      <template #footer>
        <el-button @click="importDialog = false">关闭</el-button>
        <el-button :loading="picking" @click="runImport(true)">解析预览</el-button>
        <el-button
          type="primary" :loading="importing"
          :disabled="!imp.result || imp.result.insertable === 0"
          @click="runImport(false)"
        >
          确认导入{{ imp.result ? `（${imp.result.insertable} 条）` : '' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 关卡管理：增 / 查 / 改 / 删 -->
    <el-dialog v-model="levelDialog" title="词汇关卡管理" width="720px">
      <div style="display:flex;align-items:center;margin-bottom:12px">
        <span class="muted">关卡下还有题目、或已有学生闯关记录时不能删除</span>
        <div style="flex:1"></div>
        <el-button type="primary" size="small" :icon="Plus" @click="openLevelCreate">新增关卡</el-button>
      </div>
      <el-table :data="levels" size="small" stripe style="width:100%">
        <el-table-column prop="sortNo" label="序号" width="60" />
        <el-table-column prop="name" label="关卡名称" min-width="130" />
        <el-table-column label="难度" width="90">
          <template #default="{ row }">{{ difficultyLabel(row.difficulty) }}</template>
        </el-table-column>
        <el-table-column prop="questionCount" label="题数" width="70" />
        <el-table-column prop="passScore" label="及格分" width="80" />
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
              {{ row.status === 1 ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button size="small" type="primary" link @click="openLevelEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" link @click="removeLevel(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>

    <el-dialog v-model="levelFormDialog" :title="levelForm.id ? '编辑关卡' : '新增关卡'" width="480px">
      <el-form ref="levelFormRef" :model="levelForm" :rules="levelRules" label-width="90px">
        <el-form-item label="关卡名称" prop="name">
          <el-input v-model="levelForm.name" placeholder="如 基础词汇 III" clearable />
        </el-form-item>
        <el-form-item label="关序号" prop="sortNo">
          <el-input-number v-model="levelForm.sortNo" :min="1" :step="1" />
          <span class="muted" style="margin-left:8px">决定关卡顺序</span>
        </el-form-item>
        <el-form-item label="难度" prop="difficulty">
          <el-select v-model="levelForm.difficulty" placeholder="请选择" style="width:180px">
            <el-option v-for="d in DIFFICULTIES" :key="d.value" :label="d.label" :value="d.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="抽题数" prop="questionCount">
          <el-input-number v-model="levelForm.questionCount" :min="1" :max="100" />
          <span class="muted" style="margin-left:8px">学生每次闯关抽多少题</span>
        </el-form-item>
        <el-form-item label="及格分" prop="passScore">
          <el-input-number v-model="levelForm.passScore" :min="0" :max="100" />
        </el-form-item>
        <el-form-item label="简介">
          <el-input v-model="levelForm.description" type="textarea" :rows="2" placeholder="选填" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="levelForm.status" :active-value="1" :inactive-value="0" active-text="启用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="levelFormDialog = false">取消</el-button>
        <el-button type="primary" :loading="levelSaving" @click="saveLevel">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed, nextTick } from 'vue'
import { ElMessage, ElMessageBox, genFileId } from 'element-plus'
import { Search, Plus, Grid, UploadFilled, Download } from '@element-plus/icons-vue'
import { adminApi } from '@/api'

const list = ref([])
const levels = ref([])
const total = ref(0)
const loading = ref(true)
const saving = ref(false)
const dialogVisible = ref(false)
const formRef = ref()

const query = reactive({ pageNum: 1, pageSize: 10, levelId: null, keyword: '' })

/* ---------------- 关卡管理 ---------------- */
/*
 * 难度枚举以后端实体与库中数据为准：BASIC / INTERMEDIATE / ADVANCED。
 * 这里曾经写成 BASIC / MEDIUM / ADVANCED，导致库里的 INTERMEDIATE
 * 在关卡列表里直接显示英文原文，而且编辑保存时会被改写成 MEDIUM —— 越改越乱。
 * 保留别名表只是为了兼容历史数据，新数据一律走 INTERMEDIATE。
 */
const DIFFICULTIES = [
  { value: 'BASIC', label: '基础' },
  { value: 'INTERMEDIATE', label: '中等' },
  { value: 'ADVANCED', label: '进阶' }
]
const DIFFICULTY_ALIAS = { MEDIUM: 'INTERMEDIATE', 简单: 'BASIC', 中等: 'INTERMEDIATE', 困难: 'ADVANCED' }
const levelDialog = ref(false)
const levelFormDialog = ref(false)
const levelSaving = ref(false)
const levelFormRef = ref()
const defaultLevelForm = () => ({
  id: null, name: '', sortNo: null, difficulty: 'BASIC',
  questionCount: 10, passScore: 60, description: '', status: 1
})
const levelForm = reactive(defaultLevelForm())
const levelRules = {
  name: [{ required: true, message: '请输入关卡名称', trigger: 'blur' }],
  sortNo: [{ required: true, message: '请输入关序号', trigger: 'change' }],
  difficulty: [{ required: true, message: '请选择难度', trigger: 'change' }]
}

function difficultyLabel(d) {
  const key = DIFFICULTY_ALIAS[d] || d
  const hit = DIFFICULTIES.find((x) => x.value === key)
  return hit ? hit.label : (d || '—')
}

const defaultForm = () => ({
  id: null, levelId: null, type: 'CHOICE', word: '', meaning: '',
  optionA: '', optionB: '', optionC: '', optionD: '',
  answer: 'A', analysis: '', status: 1
})
const form = reactive(defaultForm())

const rules = {
  levelId: [{ required: true, message: '请选择所属关卡', trigger: 'change' }],
  type: [{ required: true, message: '请选择题型', trigger: 'change' }],
  word: [{ required: true, message: '请输入单词', trigger: 'blur' }],
  meaning: [{ required: true, message: '请输入中文释义', trigger: 'blur' }],
  optionA: [{ required: true, message: '请输入选项 A', trigger: 'blur' }],
  optionB: [{ required: true, message: '请输入选项 B', trigger: 'blur' }],
  answer: [{ required: true, message: '请选择正确答案', trigger: 'change' }]
}

function levelName(id) {
  const lv = levels.value.find((l) => l.id === id)
  return lv ? `第${lv.sortNo}关 · ${lv.name}` : `#${id}`
}

async function load() {
  loading.value = true
  try {
    const data = await adminApi.vocabQuestions({
      pageNum: query.pageNum,
      pageSize: query.pageSize,
      levelId: query.levelId || undefined,
      keyword: query.keyword || undefined
    })
    list.value = data?.list || []
    total.value = data?.total || 0
  } finally {
    loading.value = false
  }
}

function reload() {
  query.pageNum = 1
  load()
}

function openCreate() {
  Object.assign(form, defaultForm())
  form.levelId = query.levelId || levels.value[0]?.id || null
  dialogVisible.value = true
}

function openEdit(row) {
  Object.assign(form, defaultForm(), row)
  dialogVisible.value = true
}

async function save() {
  await formRef.value.validate()
  saving.value = true
  try {
    // 拼写题不需要选项
    const payload = { ...form }
    if (payload.type === 'SPELL') {
      payload.optionA = payload.optionB = payload.optionC = payload.optionD = ''
      payload.answer = payload.word
    }
    await adminApi.saveVocabQuestion(payload)
    ElMessage.success(form.id ? '修改成功' : '新增成功')
    dialogVisible.value = false
    load()
  } finally {
    saving.value = false
  }
}

async function remove(row) {
  await ElMessageBox.confirm(`确定删除题目「${row.word}」吗？`, '删除确认', {
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    type: 'error'
  })
  await adminApi.deleteVocabQuestion(row.id)
  ElMessage.success('已删除')
  load()
}

/* ---------------- 关卡管理的增 / 改 / 删 ---------------- */
async function loadLevels() {
  levels.value = (await adminApi.vocabLevels()) || []
}

function openLevelDialog() {
  loadLevels()
  levelDialog.value = true
}

function openLevelCreate() {
  Object.assign(levelForm, defaultLevelForm(), { sortNo: levels.value.length + 1 })
  levelFormDialog.value = true
  levelFormRef.value?.clearValidate()
}

function openLevelEdit(row) {
  // 历史数据的 MEDIUM / 中文标签先归一成 INTERMEDIATE，否则下拉框匹配不上会显示空白
  Object.assign(levelForm, defaultLevelForm(), row, {
    difficulty: DIFFICULTY_ALIAS[row.difficulty] || row.difficulty || 'BASIC'
  })
  levelFormDialog.value = true
  levelFormRef.value?.clearValidate()
}

async function saveLevel() {
  await levelFormRef.value.validate()
  levelSaving.value = true
  try {
    await adminApi.saveVocabLevel({ ...levelForm })
    ElMessage.success(levelForm.id ? '关卡已修改' : '关卡已新增')
    levelFormDialog.value = false
    await loadLevels()
  } finally {
    levelSaving.value = false
  }
}

async function removeLevel(row) {
  await ElMessageBox.confirm(
    `确定删除关卡「第${row.sortNo}关 · ${row.name}」吗？`,
    '删除确认',
    { confirmButtonText: '删除', cancelButtonText: '取消', type: 'error' }
  )
  await adminApi.deleteVocabLevel(row.id)
  ElMessage.success('已删除')
  await loadLevels()
}

/* ---------------- 批量导入 ---------------- */

const TEMPLATE_HEADERS = ['单词', '中文释义', '音标', '题型', '选项A', '选项B', '选项C', '选项D', '正确答案', '解析']

/*
 * 三行示例刻意覆盖三种写法，让模板自己把用法说明白：
 *   1. 只填前两列     -> 选项由系统自动从题库已有释义里生成
 *   2. 填满选项与答案 -> 以手填的为准（正确答案那一项的文字必须与「中文释义」一致）
 *   3. 题型写「拼写」 -> 不需要选项，答案固定是单词本身
 */
const TEMPLATE_SAMPLES = [
  ['abandon', '放弃；抛弃', '', '', '', '', '', '', '', ''],
  ['fragile', '易碎的；脆弱的', '/ˈfrædʒaɪl/', '单选', '坚固的；牢固的', '易碎的；脆弱的', '稀有的；罕见的', '潮湿的；湿润的', 'B', ''],
  ['acquire', '获得；取得', '', '拼写', '', '', '', '', '', '']
]

const importDialog = ref(false)
const uploadRef = ref()
const picking = ref(false)
const importing = ref(false)
const imp = reactive({ levelId: null, defaultType: 'CHOICE', file: null, result: null })

/** 下载 CSV 模板。★ 必须带 UTF-8 BOM，否则 Excel 打开中文会乱码 */
function downloadTemplate() {
  const esc = (v) => {
    const s = String(v ?? '')
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [TEMPLATE_HEADERS, ...TEMPLATE_SAMPLES].map((r) => r.map(esc).join(','))
  const blob = new Blob(['\ufeff' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = '词汇导入模板.csv'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function openImport() {
  Object.assign(imp, {
    levelId: query.levelId || levels.value[0]?.id || null,
    defaultType: 'CHOICE',
    file: null,
    result: null
  })
  importDialog.value = true
  nextTick(() => uploadRef.value?.clearFiles())
}

function resetImport() {
  imp.file = null
  imp.result = null
  uploadRef.value?.clearFiles()
}

function onFileChange(file) {
  imp.file = file.raw
  imp.result = null // 换了文件就要重新解析，否则会拿着上一份结果点「确认导入」
}

/** limit=1 时再选一个文件会走这里：直接替换掉上一个，而不是弹一个"只能传一个"的错 */
function onFileExceed(files) {
  uploadRef.value?.clearFiles()
  const file = files[0]
  file.uid = genFileId()
  uploadRef.value?.handleStart(file)
  imp.file = file
  imp.result = null
}

async function runImport(dryRun) {
  if (!imp.levelId) {
    ElMessage.warning('请先选择目标关卡')
    return
  }
  if (!imp.file) {
    ElMessage.warning('请先选择要导入的文件')
    return
  }
  const flag = dryRun ? picking : importing
  flag.value = true
  try {
    // 预览与导入都要带同一个文件，所以这里把同一份 FormData 发两次；
    // 服务端不落任何临时文件，换了文件必须重新解析（见 onFileChange）
    const fd = new FormData()
    fd.append('file', imp.file)
    const res = await adminApi.importVocabQuestions(fd, {
      levelId: imp.levelId,
      dryRun,
      defaultType: imp.defaultType
    })
    imp.result = res
    if (dryRun) {
      ElMessage.success(res.insertable > 0
        ? `解析完成，可导入 ${res.insertable} 条`
        : '解析完成，没有可导入的行')
    } else {
      ElMessage.success(`导入完成：新增 ${res.inserted} 条`)
      await load()
      await loadLevels()
    }
  } finally {
    flag.value = false
  }
}

onMounted(async () => {
  try {
    levels.value = (await adminApi.vocabLevels()) || []
  } catch (e) {
    /* 关卡列表拉取失败不阻塞题目列表 */
  }
  load()
})
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.tip {
  font-size: 12px;
  line-height: 1.6;
  margin-top: 4px;
}

.imp-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  margin-bottom: 14px;
}

.imp-stat {
  font-size: 13px;
  color: var(--eq-text-sub);
}

.imp-stat b {
  font-size: 15px;
  color: var(--eq-text);
}

.imp-stat.ok b {
  color: var(--eq-success);
}

.imp-stat.skip b {
  color: var(--eq-warning);
}

.imp-stat.bad b {
  color: var(--eq-danger);
}

.imp-block {
  margin-bottom: 14px;
}

.imp-block-title {
  font-size: 13px;
  margin-bottom: 6px;
  color: var(--eq-text-sub);
}

.imp-block-title.bad {
  color: var(--eq-danger);
}

.imp-block-title.skip {
  color: var(--eq-warning);
}
</style>
