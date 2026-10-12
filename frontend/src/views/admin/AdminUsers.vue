<template>
  <div class="card" style="margin-bottom:0">
    <div class="toolbar">
      <el-input
        v-model="query.keyword" placeholder="搜索用户名 / 昵称" clearable style="width:230px"
        :prefix-icon="Search" @keyup.enter="reload" @clear="reload"
      />
      <el-select v-model="query.role" placeholder="全部角色" clearable style="width:140px" @change="reload">
        <el-option label="学生" value="STUDENT" />
        <el-option label="管理员" value="ADMIN" />
      </el-select>
      <el-button type="primary" :icon="Search" @click="reload">查询</el-button>
      <div style="flex:1"></div>
      <el-button type="primary" :icon="Plus" @click="openCreate">新增用户</el-button>
      <span class="muted">共 {{ total }} 位用户</span>
    </div>

    <el-table :data="list" v-loading="loading" stripe style="width:100%">
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column label="用户" min-width="180">
        <template #default="{ row }">
          <div style="display:flex;align-items:center;gap:8px">
            <div class="avatar" style="width:28px;height:28px;font-size:12px">
              {{ (row.nickname || row.username || '?').slice(0, 1) }}
            </div>
            <div>
              <div style="font-weight:600">{{ row.nickname || row.username }}</div>
              <div class="muted" style="font-size:12px">@{{ row.username }}</div>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="角色" width="100">
        <template #default="{ row }">
          <el-tag :type="row.role === 'ADMIN' ? 'warning' : 'info'" size="small">
            {{ row.role === 'ADMIN' ? '管理员' : '学生' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="totalPoints" label="积分" width="90" sortable />
      <el-table-column prop="streakDays" label="连续天数" width="100" />
      <el-table-column prop="lastStudyDate" label="最近学习" width="120">
        <template #default="{ row }">
          <span class="muted">{{ row.lastStudyDate || '暂无' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'danger'" size="small">
            {{ row.status === 1 ? '正常' : '禁用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="注册时间" width="170">
        <template #default="{ row }">
          <span class="muted">{{ (row.createTime || '').replace('T', ' ').slice(0, 16) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="230" fixed="right">
        <template #default="{ row }">
          <el-button
            size="small" :type="row.status === 1 ? 'warning' : 'success'" link
            :disabled="row.role === 'ADMIN'" @click="toggleStatus(row)"
          >
            {{ row.status === 1 ? '禁用' : '启用' }}
          </el-button>
          <el-button size="small" type="primary" link @click="resetPwd(row)">重置密码</el-button>
          <el-button size="small" type="danger" link :disabled="row.role === 'ADMIN'" @click="removeUser(row)">
            删除
          </el-button>
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

    <!-- 新增用户：学生自助注册只给 STUDENT，管理员账号在这里创建 -->
    <el-dialog v-model="dialogVisible" title="新增用户" width="480px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" placeholder="3~20 位，用于登录" clearable />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input v-model="form.password" placeholder="6~20 位" show-password />
        </el-form-item>
        <el-form-item label="昵称" prop="nickname">
          <el-input v-model="form.nickname" placeholder="不填则与用户名相同" clearable />
        </el-form-item>
        <el-form-item label="角色" prop="role">
          <el-radio-group v-model="form.role">
            <el-radio-button value="STUDENT">学生</el-radio-button>
            <el-radio-button value="ADMIN">管理员</el-radio-button>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search } from '@element-plus/icons-vue'
import { adminApi } from '@/api'

const list = ref([])
const total = ref(0)
const loading = ref(true)
const query = reactive({ pageNum: 1, pageSize: 10, keyword: '', role: '' })

/* ---------------- 新增用户 ---------------- */
const dialogVisible = ref(false)
const saving = ref(false)
const formRef = ref()
const form = reactive({ username: '', password: '', nickname: '', role: 'STUDENT' })
const rules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 20, message: '长度需为 3~20 位', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 20, message: '长度需为 6~20 位', trigger: 'blur' }
  ],
  role: [{ required: true, message: '请选择角色', trigger: 'change' }]
}

async function load() {
  loading.value = true
  try {
    const data = await adminApi.users({
      pageNum: query.pageNum,
      pageSize: query.pageSize,
      keyword: query.keyword || undefined,
      role: query.role || undefined
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

async function toggleStatus(row) {
  const next = row.status === 1 ? 0 : 1
  await adminApi.updateUserStatus(row.id, next)
  ElMessage.success(next === 1 ? '已启用该用户' : '已禁用该用户')
  load()
}

async function resetPwd(row) {
  await ElMessageBox.confirm(`将「${row.nickname || row.username}」的密码重置为默认密码？`, '重置密码', {
    confirmButtonText: '重置',
    cancelButtonText: '取消',
    type: 'warning'
  })
  await adminApi.resetPassword(row.id)
  ElMessage.success('密码已重置为默认密码')
}

async function removeUser(row) {
  await ElMessageBox.confirm(
    `确定删除用户「${row.nickname || row.username}」吗？该操作不可恢复。`,
    '删除确认',
    { confirmButtonText: '删除', cancelButtonText: '取消', type: 'error' }
  )
  await adminApi.deleteUser(row.id)
  ElMessage.success('已删除')
  load()
}

function openCreate() {
  Object.assign(form, { username: '', password: '', nickname: '', role: 'STUDENT' })
  dialogVisible.value = true
  formRef.value?.clearValidate()
}

async function save() {
  await formRef.value.validate()
  saving.value = true
  try {
    await adminApi.createUser({ ...form })
    ElMessage.success(form.role === 'ADMIN' ? '管理员账号已创建' : '学生账号已创建')
    dialogVisible.value = false
    reload()
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}
</style>
