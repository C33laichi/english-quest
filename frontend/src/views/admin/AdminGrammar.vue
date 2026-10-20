<template>
  <div class="card" style="margin-bottom:0">
    <div class="toolbar">
      <el-select v-model="query.lessonId" placeholder="全部天数" clearable filterable style="width:210px" @change="reload">
        <el-option
          v-for="ls in lessons" :key="ls.id"
          :label="`Day ${ls.dayNo} · ${ls.title}`" :value="ls.id"
        />
      </el-select>
      <el-input
        v-model="query.keyword" placeholder="搜索题干 / 知识点" clearable style="width:220px"
        :prefix-icon="Search" @keyup.enter="reload" @clear="reload"
      />
      <el-button type="primary" :icon="Search" @click="reload">查询</el-button>
      <div style="flex:1"></div>
      <el-tabs v-model="tab" style="margin-bottom:-16px">
        <el-tab-pane label="题目管理" name="question" />
        <el-tab-pane label="讲义管理" name="lesson" />
      </el-tabs>
    </div>

    <!-- 题目管理 -->
    <template v-if="tab === 'question'">
      <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
        <span class="muted" style="margin-right:10px;line-height:32px">共 {{ total }} 题</span>
        <el-button :icon="UploadFilled" @click="openImport">批量导入</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新增题目</el-button>
      </div>

      <el-table :data="list" v-loading="loading" stripe style="width:100%">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column label="所属天数" width="120">
          <template #default="{ row }">
            <el-tag size="small" type="info">{{ lessonLabel(row.lessonId) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="stem" label="题干" min-width="260" show-overflow-tooltip />
        <el-table-column prop="knowledgePoint" label="知识点" width="140" show-overflow-tooltip />
        <el-table-column prop="answer" label="答案" width="70">
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
    </template>

    <!-- 讲义管理（语法关卡 = Day） -->
    <template v-else>
      <div style="display:flex;align-items:center;margin-bottom:12px">
        <span class="muted">语法关按日解锁，删除只能从最后一天往前（删中间那天会让后面全部锁死）</span>
        <div style="flex:1"></div>
        <el-button type="primary" :icon="Plus" @click="openLessonCreate">新增 Day</el-button>
      </div>
      <el-table :data="lessons" v-loading="lessonLoading" stripe style="width:100%">
        <el-table-column prop="dayNo" label="天数" width="90">
          <template #default="{ row }">Day {{ row.dayNo }}</template>
        </el-table-column>
        <el-table-column prop="title" label="标题" width="150" />
        <el-table-column prop="stage" label="所属阶段" min-width="200" show-overflow-tooltip />
        <el-table-column prop="mode" label="模式" width="90">
          <template #default="{ row }">
            <el-tag size="small">{{ row.mode }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="questionCount" label="题量" width="80" />
        <el-table-column prop="passScore" label="及格分" width="90" />
        <el-table-column label="讲义" width="110">
          <template #default="{ row }">
            <span class="muted">{{ pointCount(row.content) }} 条知识点</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" link @click="openLesson(row)">编辑</el-button>
            <el-button size="small" type="danger" link @click="removeLesson(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </template>

    <!-- 题目弹窗 -->
    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑题目' : '新增题目'" width="600px">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="90px">
        <el-form-item label="所属天数" prop="lessonId">
          <el-select v-model="form.lessonId" placeholder="请选择天数" filterable style="width:100%">
            <el-option
              v-for="ls in lessons" :key="ls.id"
              :label="`Day ${ls.dayNo} · ${ls.title}`" :value="ls.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="知识点" prop="knowledgePoint">
          <el-input v-model="form.knowledgePoint" placeholder="如 名词考点" clearable />
        </el-form-item>
        <el-form-item label="题干" prop="stem">
          <el-input v-model="form.stem" type="textarea" :rows="2" placeholder="如 There are many ______ in the hall." />
        </el-form-item>
        <el-form-item label="选项 A" prop="optionA"><el-input v-model="form.optionA" /></el-form-item>
        <el-form-item label="选项 B" prop="optionB"><el-input v-model="form.optionB" /></el-form-item>
        <el-form-item label="选项 C" prop="optionC"><el-input v-model="form.optionC" /></el-form-item>
        <el-form-item label="选项 D" prop="optionD"><el-input v-model="form.optionD" /></el-form-item>
        <el-form-item label="正确答案" prop="answer">
          <el-radio-group v-model="form.answer">
            <el-radio-button value="A">A</el-radio-button>
            <el-radio-button value="B">B</el-radio-button>
            <el-radio-button value="C">C</el-radio-button>
            <el-radio-button value="D">D</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="解析">
          <el-input v-model="form.analysis" type="textarea" :rows="3" placeholder="选填，答错后展示" />
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

    <!-- 讲义弹窗 -->
    <el-dialog
      v-model="lessonDialog"
      :title="lessonForm.id ? `编辑讲义 · Day ${lessonForm.dayNo}` : '新增关卡（Day）'"
      width="640px"
    >
      <el-form :model="lessonForm" label-width="90px">
        <el-form-item label="天数">
          <el-input-number v-model="lessonForm.dayNo" :min="1" :max="99" :disabled="!!lessonForm.id" />
          <span class="muted" style="margin-left:8px">
            {{ lessonForm.id ? '创建后不可改（会打乱学生进度）' : '建议接着最后一个 Day 顺延' }}
          </span>
        </el-form-item>
        <el-form-item label="标题">
          <el-input v-model="lessonForm.title" />
        </el-form-item>
        <el-form-item label="所属阶段">
          <el-input v-model="lessonForm.stage" />
        </el-form-item>
        <el-form-item label="模式">
          <el-radio-group v-model="lessonForm.mode">
            <el-radio-button value="学习">学习</el-radio-button>
            <el-radio-button value="复习">复习</el-radio-button>
            <el-radio-button value="自测">自测</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="及格分">
          <el-input-number v-model="lessonForm.passScore" :min="0" :max="100" />
        </el-form-item>
        <el-form-item label="讲义内容">
          <el-input
            v-model="lessonForm.content" type="textarea" :rows="12"
            placeholder='JSON 数组格式，如 [{"text":"知识点","example":"例句"}]'
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="lessonDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveLesson">保存</el-button>
      </template>
    </el-dialog>

    <!-- 批量导入：选默认 Day -> 传文件 -> 解析预览 -> 确认入库 -->
    <el-dialog v-model="importDialog" title="批量导入语法题" width="800px" @closed="resetImport">
      <el-alert type="info" :closable="false" show-icon style="margin-bottom:16px">
        <template #title>
          支持 .xlsx / .xls / .csv / <b>.pdf</b>。表格的表头必须有「题干」「选项A」「选项B」「选项C」「选项D」「正确答案」；
          <b>4 个选项必须全部填写</b>——语法题的干扰项要和题干空格搭配，系统不自动生成。
        </template>
        <template #default>
          <div class="muted" style="font-size:12px;line-height:1.7;margin-top:4px">
            PDF 两种都认：有文字层的直接抽文字；扫描件（整页是图片）会先做 OCR，比较慢（一页约 1~2 秒，默认最多识别 40 页）。
            扫描件里通常没有答案，缺答案的题会交给 AI 作答，入库前<b>请务必抽查几道</b>。
          </div>
        </template>
      </el-alert>

      <el-form label-width="96px">
        <el-form-item label="默认目标 Day" required>
          <el-select v-model="imp.lessonId" placeholder="请选择默认要导入到哪一天" filterable style="width:100%">
            <el-option
              v-for="ls in lessons" :key="ls.id"
              :label="`Day ${ls.dayNo} · ${ls.title}`" :value="ls.id"
            />
          </el-select>
          <div class="muted tip">
            「天数」列留空的行会导入到这里；也可以在这一列填 Day 序号（3 / Day 3 / 第3天）或讲义标题，一个文件就能同时导入多天。
          </div>
        </el-form-item>

        <el-form-item label="选择文件">
          <div style="width:100%">
            <el-upload
              ref="uploadRef"
              drag
              :auto-upload="false"
              :limit="1"
              accept=".xlsx,.xls,.csv,.pdf"
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
              同一天里题干重复的题会自动跳过。「知识点」留空时按该 Day 的讲义标题补全，「解析」留空时补一句通用提示。
            </div>
          </div>
        </el-form-item>
      </el-form>

      <!-- 解析结果 -->
      <template v-if="imp.result">
        <el-divider content-position="left">
          {{ imp.result.dryRun ? '解析结果（尚未写入题库）' : '导入结果' }}
        </el-divider>

        <!-- PDF/OCR 的识别摘要：多少题、跳过什么、有没有缺答案，读不懂就不知道该不该点导入 -->
        <el-alert
          v-if="imp.result.tip" type="warning" :closable="false" show-icon
          style="margin-bottom:12px"
        >
          <template #title><span style="font-size:13px">识别情况</span></template>
          <div style="font-size:12px;line-height:1.8">{{ imp.result.tip }}</div>
        </el-alert>

        <div class="imp-stats">
          <span class="imp-stat">文件数据行 <b>{{ imp.result.total }}</b></span>
          <span class="imp-stat ok">可导入 <b>{{ imp.result.insertable }}</b></span>
          <span v-if="!imp.result.dryRun" class="imp-stat ok">已写入 <b>{{ imp.result.inserted }}</b></span>
          <span class="imp-stat">涉及 Day <b>{{ imp.result.lessonCount }}</b></span>
          <span class="imp-stat skip">跳过重复 <b>{{ imp.result.skipped }}</b></span>
          <span class="imp-stat bad">失败 <b>{{ imp.result.failed }}</b></span>
        </div>

        <div v-if="imp.result.preview?.length" class="imp-block">
          <div class="imp-block-title">前 {{ imp.result.preview.length }} 行预览</div>
          <el-table :data="imp.result.preview" size="small" stripe max-height="240">
            <el-table-column prop="rowNo" label="行号" width="60" />
            <el-table-column label="天数" width="86">
              <template #default="{ row }">Day {{ row.dayNo }}</template>
            </el-table-column>
            <el-table-column prop="stem" label="题干" min-width="240" show-overflow-tooltip />
            <el-table-column prop="knowledgePoint" label="知识点" width="130" show-overflow-tooltip />
            <el-table-column label="选项" min-width="200">
              <template #default="{ row }">
                <span class="muted" style="font-size:12px">
                  A.{{ row.optionA }} / B.{{ row.optionB }} / C.{{ row.optionC }} / D.{{ row.optionD }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="答案" width="70">
              <template #default="{ row }">
                <b style="color:var(--eq-success)">{{ row.answer }}</b>
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
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, nextTick } from 'vue'
import { ElMessage, ElMessageBox, genFileId } from 'element-plus'
import { Search, Plus, UploadFilled, Download } from '@element-plus/icons-vue'
import { adminApi } from '@/api'

const tab = ref('question')

const list = ref([])
const lessons = ref([])
const total = ref(0)
const loading = ref(true)
const lessonLoading = ref(true)
const saving = ref(false)

const dialogVisible = ref(false)
const lessonDialog = ref(false)
const formRef = ref()

/* ---------------- 批量导入 ---------------- */
const importDialog = ref(false)
const uploadRef = ref()
const picking = ref(false)
const importing = ref(false)
const imp = reactive({
  /** 默认目标 Day：「天数」列留空的行落到它 */
  lessonId: null,
  file: null,
  result: null
})

/**
 * 导入模板。
 *
 * 前两行故意写成"带天数"和"不带天数"各一条：
 * 前者教管理员一份文件可以跨多天，后者教他「天数」列留空就落到所选的那一天。
 * 第 4 行示范"知识点 / 解析留空"（系统会自动补）以及讲义标题也能当天数写。
 */
const TEMPLATE_HEADERS = ['天数', '题干', '选项A', '选项B', '选项C', '选项D', '正确答案', '知识点', '解析']
const TEMPLATE_SAMPLES = [
  ['1', 'There are many ______ in the hall.', 'woman teachers', 'women teachers', 'woman teacher', 'women teacher', 'B', '名词考点', ''],
  ['', 'He gave me some useful ______ on how to learn English well.', 'advices', 'advice', 'advise', "advices'", 'B', '', ''],
  ['Day 3', 'She is ______ than her sister.', 'more taller', 'taller', 'tallest', 'the tallest', 'B', '形容词和副词', 'than 前面要用比较级，tall 的比较级是 taller（more 与 -er 不能同时用）。'],
  ['形容词和副词', 'Of the two boys, Tom is ______.', 'the taller', 'taller', 'tall', 'tallest', 'A', '', '两者比较用 the + 比较级，表示"两者中较……的那一个"。']
]

const query = reactive({ pageNum: 1, pageSize: 10, lessonId: null, keyword: '' })

const defaultForm = () => ({
  id: null, lessonId: null, type: 'CHOICE', stem: '',
  optionA: '', optionB: '', optionC: '', optionD: '',
  answer: 'A', analysis: '', knowledgePoint: '', status: 1
})
const form = reactive(defaultForm())

const lessonForm = reactive({
  id: null, dayNo: null, title: '', stage: '', mode: '学习',
  passScore: 60, content: '', questionCount: 3
})

const rules = {
  lessonId: [{ required: true, message: '请选择所属天数', trigger: 'change' }],
  stem: [{ required: true, message: '请输入题干', trigger: 'blur' }],
  optionA: [{ required: true, message: '请输入选项 A', trigger: 'blur' }],
  optionB: [{ required: true, message: '请输入选项 B', trigger: 'blur' }],
  answer: [{ required: true, message: '请选择正确答案', trigger: 'change' }]
}

function lessonLabel(id) {
  const ls = lessons.value.find((l) => l.id === id)
  return ls ? `Day ${ls.dayNo}` : `#${id}`
}

function pointCount(content) {
  if (!content) return 0
  try {
    const arr = JSON.parse(content)
    return Array.isArray(arr) ? arr.length : 0
  } catch (e) {
    return 0
  }
}

async function load() {
  loading.value = true
  try {
    const data = await adminApi.grammarQuestions({
      pageNum: query.pageNum,
      pageSize: query.pageSize,
      lessonId: query.lessonId || undefined,
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
  form.lessonId = query.lessonId || lessons.value[0]?.id || null
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
    await adminApi.saveGrammarQuestion({ ...form })
    ElMessage.success(form.id ? '修改成功' : '新增成功')
    dialogVisible.value = false
    load()
  } finally {
    saving.value = false
  }
}

async function remove(row) {
  await ElMessageBox.confirm('确定删除这道语法题吗？', '删除确认', {
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    type: 'error'
  })
  await adminApi.deleteGrammarQuestion(row.id)
  ElMessage.success('已删除')
  load()
}

function openLesson(row) {
  Object.assign(lessonForm, row)
  lessonDialog.value = true
}

/** 新增一个语法关卡（Day），默认接在最后一天后面 */
function openLessonCreate() {
  const maxDay = lessons.value.reduce((max, l) => Math.max(max, l.dayNo || 0), 0)
  Object.assign(lessonForm, {
    id: null,
    dayNo: maxDay + 1,
    title: '',
    stage: '',
    mode: '学习',
    passScore: 60,
    content: '[]',
    questionCount: 3
  })
  lessonDialog.value = true
}

/** 删除语法关卡（Day）：后端会拦下"后面还有 Day""有题目""有学习记录"三种情况 */
async function removeLesson(row) {
  await ElMessageBox.confirm(
    `确定删除 Day ${row.dayNo}「${row.title}」吗？该关卡下的题目需要先删完。`,
    '删除确认',
    { confirmButtonText: '删除', cancelButtonText: '取消', type: 'error' }
  )
  await adminApi.deleteGrammarLesson(row.id)
  ElMessage.success('已删除')
  await loadLessons()
}

async function saveLesson() {
  // 校验 JSON 合法性，避免写入脏数据导致学生端讲义打不开
  try {
    const arr = JSON.parse(lessonForm.content || '[]')
    if (!Array.isArray(arr)) throw new Error('必须是数组')
  } catch (e) {
    ElMessage.error('讲义内容必须是合法的 JSON 数组')
    return
  }
  saving.value = true
  try {
    await adminApi.saveGrammarLesson({ ...lessonForm })
    ElMessage.success(lessonForm.id ? '讲义已保存' : '关卡已新增')
    lessonDialog.value = false
    await loadLessons()
  } finally {
    saving.value = false
  }
}

async function loadLessons() {
  lessonLoading.value = true
  try {
    lessons.value = (await adminApi.grammarLessons()) || []
  } finally {
    lessonLoading.value = false
  }
}

/* ---------------- 批量导入 ---------------- */

/** 下载 CSV 模板：必须带 UTF-8 BOM，否则 Excel 打开中文是乱码 */
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
  a.download = '语法题导入模板.csv'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function openImport() {
  Object.assign(imp, {
    lessonId: query.lessonId || lessons.value[0]?.id || null,
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

function onFileExceed(files) {
  uploadRef.value?.clearFiles()
  const file = files[0]
  file.uid = genFileId()
  uploadRef.value?.handleStart(file)
  imp.file = file
  imp.result = null
}

async function runImport(dryRun) {
  if (!imp.lessonId) {
    ElMessage.warning('请先选择默认目标 Day')
    return
  }
  if (!imp.file) {
    ElMessage.warning('请先选择要导入的文件')
    return
  }
  const flag = dryRun ? picking : importing
  flag.value = true
  try {
    // 预览与导入都要带同一个文件，所以把同一份 FormData 发两次；
    // 服务端不落任何临时文件，换了文件必须重新解析（见 onFileChange）
    const fd = new FormData()
    fd.append('file', imp.file)
    const res = await adminApi.importGrammarQuestions(fd, { lessonId: imp.lessonId, dryRun })
    imp.result = res
    if (dryRun) {
      ElMessage.success(res.insertable > 0
        ? `解析完成，可导入 ${res.insertable} 条`
        : '解析完成，没有可导入的行')
    } else {
      ElMessage.success(`导入完成：新增 ${res.inserted} 条`)
      await loadLessons()
      await load()
    }
  } finally {
    flag.value = false
  }
}

onMounted(async () => {
  await loadLessons()
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

/* 与 AdminVocab 的批量导入保持同一套类名与配色，两个页面看起来才是一家的 */
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
