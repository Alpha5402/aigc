<template>
  <view class="admin-app">
    <view class="app-sidebar">
      <view class="sidebar-brand">
        <view class="brand-mark">田</view>
        <view class="brand-copy">
          <text class="brand-name">云上农管家</text>
          <text class="brand-subtitle">管理控制台</text>
        </view>
      </view>

      <view class="sidebar-nav">
        <view
          v-for="tab in tabs"
          :key="tab.key"
          :class="['nav-item', activeTab === tab.key ? 'is-active' : '']"
          @click="switchTab(tab.key)"
        >
          <text class="nav-dot"></text>
          <text class="nav-label">{{ tab.label }}</text>
        </view>
      </view>

      <view class="sidebar-footer">
        <view class="admin-identity">
          <text class="identity-label">当前身份</text>
          <text class="identity-value">{{ authStore.userInfo?.nickname || authStore.userInfo?.phone || '管理员' }}</text>
        </view>
        <view class="sidebar-actions">
          <button class="sidebar-action-btn sidebar-action-refresh" @click="loadCurrentTab">刷新数据</button>
          <button class="sidebar-action-btn sidebar-action-logout" @click="handleLogout">退出登录</button>
        </view>
      </view>
    </view>

    <view class="app-main">
      <scroll-view class="app-content" scroll-y>
        <view class="content-inner">
          <view v-if="activeTab === 'overview'" class="tab-pane">
            <view class="kpi-grid">
              <view v-for="card in coreKpis" :key="card.key" class="kpi-card">
                <text class="kpi-label">{{ card.label }}</text>
                <text class="kpi-value">{{ card.value }}</text>
                <text class="kpi-note">{{ card.note }}</text>
              </view>
            </view>

            <view class="split-grid">
              <section class="panel">
                <view class="panel-header">
                  <view>
                    <text class="panel-title">业务概览</text>
                    <text class="panel-subtitle">查看种植、销售与行情数据的整体情况</text>
                  </view>
                </view>
                <view class="chain-row">
                  <view v-for="(step, index) in businessChain" :key="step.label" class="chain-step">
                    <view class="chain-index">{{ index + 1 }}</view>
                    <text class="chain-title">{{ step.label }}</text>
                    <text class="chain-desc">{{ step.desc }}</text>
                    <text v-if="index < businessChain.length - 1" class="chain-arrow">→</text>
                  </view>
                </view>
              </section>

              <section class="panel">
                <view class="panel-header compact">
                  <text class="panel-title">管理员待办</text>
                </view>
                <view class="todo-list">
                  <view v-for="item in todoItems" :key="item.label" class="todo-item" @click="switchTab(item.tab)">
                    <view>
                      <text class="todo-label">{{ item.label }}</text>
                      <text class="todo-desc">{{ item.desc }}</text>
                    </view>
                    <text :class="['todo-value', item.warn ? 'warn' : '']">{{ item.value }}</text>
                  </view>
                </view>
              </section>
            </view>

            <view class="split-grid">
              <section class="panel">
                <view class="panel-header compact">
                  <text class="panel-title">最新行情波动</text>
                  <button class="btn-ghost" @click="switchTab('market')">查看行情</button>
                </view>
                <view class="table-scroll">
                <view class="table-inner dashboard-market-table">
                  <view class="table-head dashboard-market-grid">
                    <text>作物</text><text>当前价</text><text>涨跌幅</text><text>市场状态</text><text>预测</text>
                  </view>
                  <view v-if="!dashboardMarketItems.length" class="empty-row">暂无行情数据</view>
                  <view v-for="item in pagedDashboardMarketItems" :key="item.id" class="table-row dashboard-market-grid">
                    <text class="cell-strong ellipsis">{{ item.name }}</text>
                    <text>{{ item.currentPrice }} / {{ item.unit }}</text>
                    <text :class="['trend-text', getTrendClass(item.change)]">{{ formatSignedPercent(item.change) }}</text>
                    <text>{{ item.marketStatus }}</text>
                    <text class="ellipsis">{{ item.prediction }}</text>
                  </view>
                  <view v-for="index in getPlaceholderRows(pagedDashboardMarketItems.length, dashboardMarketPageSize)" :key="`dashboard-market-empty-${index}`" class="table-row dashboard-market-grid table-row-placeholder">
                    <text></text><text></text><text></text><text></text><text></text>
                  </view>
                </view>
                </view>
                <view v-if="dashboardMarketTotalPages > 1" class="table-pagination">
                  <text class="pagination-info">共 {{ dashboardMarketItems.length }} 条，第 {{ dashboardMarketPage }} / {{ dashboardMarketTotalPages }} 页</text>
                  <view class="pagination-actions">
                    <button class="page-btn" :disabled="dashboardMarketPage <= 1" @click="dashboardMarketPage--">上一页</button>
                    <button class="page-btn" :disabled="dashboardMarketPage >= dashboardMarketTotalPages" @click="dashboardMarketPage++">下一页</button>
                  </view>
                </view>
              </section>

              <section class="panel">
                <view class="panel-header compact">
                  <text class="panel-title">最近审计日志</text>
                  <button class="btn-ghost" @click="switchTab('ops')">系统运维</button>
                </view>
                <view class="audit-feed">
                  <view v-if="!auditLogs.length" class="empty-row">暂无审计日志</view>
                  <view v-for="log in auditLogs.slice(0, 5)" :key="log.id" class="feed-row">
                    <text class="feed-title">{{ cleanDisplayText(log.actionType) }}</text>
                    <text class="feed-desc">{{ log.userNickname || log.userPhone || '系统' }} · {{ cleanDisplayText(log.detail || log.resourceType) }}</text>
                    <text class="feed-time">{{ formatDateTime(log.createdAt) }}</text>
                  </view>
                </view>
              </section>
            </view>
          </view>

          <view v-if="activeTab === 'users'" class="tab-pane">
            <view class="workbench-grid users-grid">
              <section class="panel">
                <view class="panel-header compact">
                  <view>
                    <text class="panel-title">用户管理</text>
                    <text class="panel-subtitle">点击行查看账号详情和角色操作</text>
                  </view>
                </view>
                <view class="table-scroll">
                <view class="table-inner user-table-wrap">
                  <view class="table-head user-table-grid">
                    <text>昵称</text><text>手机号</text><text>注册时间</text><text>角色</text><text>作物</text><text>问诊</text><text>广告</text><text>互动</text><text>未读</text>
                  </view>
                  <view v-if="!users.length" class="empty-row">暂无用户数据</view>
                  <view
                    v-for="user in pagedUsers"
                    :key="user.id"
                    :class="['table-row user-table-grid clickable', selectedUser?.id === user.id ? 'is-selected' : '']"
                    @click="selectUser(user)"
                  >
                    <text class="cell-strong ellipsis">{{ user.nickname || '未命名用户' }}</text>
                    <text>{{ user.phone }}</text>
                    <text>{{ formatDateTime(user.createdAt) }}</text>
                    <text><text :class="['badge', `role-${user.role}`]">{{ formatRole(user.role) }}</text></text>
                    <text class="table-number-cell">{{ user.cropCount }}</text>
                    <text class="table-number-cell">{{ user.diagnosisCount }}</text>
                    <text class="table-number-cell">{{ user.adCount }}</text>
                    <text class="table-number-cell">{{ user.interestCount }}</text>
                    <text class="table-number-cell">{{ user.unreadCount }}</text>
                  </view>
                  <view v-for="index in getPlaceholderRows(pagedUsers.length, userPageSize)" :key="`user-empty-${index}`" class="table-row user-table-grid table-row-placeholder">
                    <text></text><text></text><text></text><text></text><text></text><text></text><text></text><text></text><text></text>
                  </view>
                </view>
                </view>
                <view v-if="userTotalPages > 1" class="table-pagination">
                  <text class="pagination-info">共 {{ users.length }} 条，第 {{ userPage }} / {{ userTotalPages }} 页</text>
                  <view class="pagination-actions">
                    <button class="page-btn" :disabled="userPage <= 1" @click="userPage--">上一页</button>
                    <button class="page-btn" :disabled="userPage >= userTotalPages" @click="userPage++">下一页</button>
                  </view>
                </view>
              </section>

              <aside class="panel sticky-panel">
                <view class="panel-header compact">
                  <text class="panel-title">农户详情</text>
                </view>
                <view v-if="selectedUser" class="detail-stack">
                  <view class="profile-block">
                    <text class="profile-name">{{ selectedUser.nickname || '未命名用户' }}</text>
                    <text class="profile-meta">{{ selectedUser.phone }} · {{ formatRole(selectedUser.role) }}</text>
                  </view>
                  <view class="metric-grid">
                    <view><text>{{ selectedUser.cropCount }}</text><span>作物档案</span></view>
                    <view><text>{{ selectedUser.diagnosisCount }}</text><span>农技问诊</span></view>
                    <view><text>{{ selectedUser.adCount }}</text><span>营销文案</span></view>
                    <view><text>{{ selectedUser.interestCount }}</text><span>买家互动</span></view>
                  </view>
                  <view class="detail-section">
                    <text class="section-label">角色管理</text>
                    <button class="btn-primary full" :loading="userRoleBusyId === selectedUser.id" @click="updateUserRoleNow(selectedUser.id, 'admin')">设为管理员</button>
                    <button class="btn-secondary full" :loading="userRoleBusyId === selectedUser.id" @click="updateUserRoleNow(selectedUser.id, 'demo')">设为体验账号</button>
                    <button class="btn-soft full" :loading="userRoleBusyId === selectedUser.id" @click="updateUserRoleNow(selectedUser.id, 'user')">恢复普通用户</button>
                  </view>
                </view>
                <view v-else class="empty-panel">请选择左侧用户</view>
              </aside>
            </view>
          </view>

          <view v-if="activeTab === 'merchants'" class="tab-pane">
            <view class="mini-kpi-grid">
              <view v-for="item in merchantKpis" :key="item.label" class="mini-kpi">
                <text>{{ item.label }}</text><strong>{{ item.value }}</strong>
              </view>
            </view>
            <view class="workbench-grid merchants-grid">
              <section class="panel">
                <view class="panel-header compact">
                  <view>
                    <text class="panel-title">销路管理</text>
                    <text class="panel-subtitle">集中处理商户审核和收购报价</text>
                  </view>
                  <button class="btn-primary" @click="newMerchant">新增商户</button>
                </view>
                <view class="filter-bar">
                  <button v-for="opt in merchantStatusOptions" :key="opt.value" :class="['filter-btn', merchantStatusFilter === opt.value ? 'is-active' : '']" @click="onMerchantFilterChange(opt.value)">{{ opt.label }}</button>
                </view>
                <view class="table table-fixed-7">
                  <view class="table-head cols-merchants">
                    <text>名称</text><text>联系人</text><text>电话</text><text>地区</text><text>报价数量</text><text>来源</text><text>状态</text>
                  </view>
                  <view v-if="!merchants.length" class="empty-row">暂无商户数据</view>
                  <view v-for="merchant in pagedMerchants" :key="merchant.id || merchant.name" :class="['table-row cols-merchants clickable', merchantForm.id === merchant.id ? 'is-selected' : '']" @click="editMerchant(merchant)">
                    <text class="cell-strong ellipsis">{{ merchant.name }}</text>
                    <text>{{ merchant.contactName || '-' }}</text>
                    <text>{{ merchant.contactPhone || '-' }}</text>
                    <text class="ellipsis">{{ merchant.district || merchant.address || '-' }}</text>
                    <view class="offer-summary">
                      <text>{{ formatOfferCount(merchant) }}</text>
                      <button v-if="merchant.offers?.length" class="btn-ghost tiny" @click.stop="openOfferModal(merchant)">查看详情</button>
                    </view>
                    <text>{{ merchant.sourcePlatform || '平台维护' }}</text>
                    <text><text :class="['badge', `status-${merchant.status}`]">{{ formatStatus(merchant.status) }}</text></text>
                  </view>
                  <view v-for="index in getPlaceholderRows(pagedMerchants.length, merchantPageSize)" :key="`merchant-empty-${index}`" class="table-row cols-merchants table-row-placeholder">
                    <text></text><text></text><text></text><text></text><text></text><text></text><text></text>
                  </view>
                </view>
                <view v-if="merchantTotalPages > 1" class="table-pagination">
                  <text class="pagination-info">共 {{ merchants.length }} 条，第 {{ merchantPage }} / {{ merchantTotalPages }} 页</text>
                  <view class="pagination-actions">
                    <button class="page-btn" :disabled="merchantPage <= 1" @click="merchantPage--">上一页</button>
                    <button class="page-btn" :disabled="merchantPage >= merchantTotalPages" @click="merchantPage++">下一页</button>
                  </view>
                </view>
              </section>

              <aside class="panel sticky-panel">
                <view class="panel-header compact">
                  <view>
                    <text class="panel-title">审核 / 编辑面板</text>
                    <text class="panel-subtitle">{{ merchantForm.id ? `ID ${merchantForm.id}` : '新商户' }}</text>
                  </view>
                </view>
                <view class="form-stack panel-pad">
                  <view class="form-grid two-cols">
                    <label><text>商户名称</text><input v-model="merchantForm.name" class="input" /></label>
                    <label><text>商户类型</text><input v-model="merchantForm.merchantType" class="input" /></label>
                    <label><text>联系人</text><input v-model="merchantForm.contactName" class="input" /></label>
                    <label><text>联系电话</text><input v-model="merchantForm.contactPhone" class="input" /></label>
                    <label><text>地区</text><input v-model="merchantForm.district" class="input" /></label>
                    <label><text>营业时间</text><input v-model="merchantForm.businessHours" class="input" /></label>
                  </view>
                  <label><text>详细地址</text><input v-model="merchantForm.address" class="input" /></label>
                  <view class="form-grid two-cols">
                    <label><text>来源平台</text><input v-model="merchantForm.sourcePlatform" class="input" /></label>
                    <label><text>来源链接</text><input v-model="merchantForm.sourceUrl" class="input" /></label>
                  </view>
                  <label><text>来源说明</text><textarea v-model="merchantForm.sourceNote" class="textarea small" /></label>

                  <view class="offer-header">
                    <text class="section-label">报价明细</text>
                    <button class="btn-ghost" @click="addOffer">新增报价</button>
                  </view>
                  <view v-for="(offer, index) in merchantForm.offers" :key="index" class="offer-row">
                    <input v-model="offer.cropName" class="input" placeholder="作物" />
                    <input v-model.number="offer.price" type="number" class="input" placeholder="价格" />
                    <input v-model.number="offer.demand" type="number" class="input" placeholder="需求" />
                    <input v-model="offer.unit" class="input" placeholder="单位" />
                    <button class="btn-soft tiny" @click="removeOffer(index)">移除</button>
                  </view>

                  <label><text>审核备注</text><textarea v-model="merchantForm.reviewNote" class="textarea small" /></label>
                  <view class="action-row wrap">
                    <button class="btn-primary" :loading="merchantAuditBusyId === merchantForm.id" @click="auditMerchantNow(merchantForm, 'active')">通过审核</button>
                    <button class="btn-danger" :loading="merchantAuditBusyId === merchantForm.id" @click="auditMerchantNow(merchantForm, 'rejected')">驳回申请</button>
                    <button class="btn-secondary" @click="saveMerchant">保存修改</button>
                    <button class="btn-soft" @click="removeMerchant(merchantForm)">停用商户</button>
                  </view>
                </view>
              </aside>
            </view>

            <view v-if="offerModalVisible" class="modal-mask" @click="closeOfferModal">
              <view class="offer-modal" @click.stop>
                <view class="modal-header">
                  <text class="modal-title">报价明细 - {{ selectedOfferMerchant?.name || '商户' }}</text>
                  <button class="modal-close" @click="closeOfferModal">×</button>
                </view>
                <view class="modal-body">
                  <view v-if="selectedOfferMerchant" class="merchant-summary-card">
                    <view>
                      <text class="summary-label">商户名称</text>
                      <text class="summary-value">{{ selectedOfferMerchant.name || '-' }}</text>
                    </view>
                    <view>
                      <text class="summary-label">联系人</text>
                      <text class="summary-value">{{ selectedOfferMerchant.contactName || '-' }}</text>
                    </view>
                    <view>
                      <text class="summary-label">联系电话</text>
                      <text class="summary-value">{{ selectedOfferMerchant.contactPhone || '-' }}</text>
                    </view>
                    <view>
                      <text class="summary-label">地区 / 地址</text>
                      <text class="summary-value ellipsis">{{ selectedOfferMerchant.district || selectedOfferMerchant.address || '-' }}</text>
                    </view>
                    <view>
                      <text class="summary-label">商户状态</text>
                      <text :class="['badge', `status-${selectedOfferMerchant.status}`]">{{ formatStatus(selectedOfferMerchant.status) }}</text>
                    </view>
                  </view>

                  <view class="offer-search-row">
                    <input v-model="offerSearchKeyword" class="input" placeholder="搜索作物名称" />
                    <text class="offer-count-tip">{{ filteredMerchantOffers.length }} / {{ selectedOfferMerchant?.offers?.length || 0 }} 条</text>
                  </view>

                  <view v-if="!selectedOfferMerchant?.offers?.length" class="modal-empty">该商户暂未维护报价信息</view>
                  <view v-else-if="!filteredMerchantOffers.length" class="modal-empty">未找到匹配的作物报价</view>
                  <scroll-view v-else class="offer-table-scroll" scroll-y>
                    <view class="offer-detail-table">
                      <view class="offer-detail-head">
                        <text>作物名称</text><text>报价</text><text>需求量</text><text>最小起收量</text>
                      </view>
                      <view v-for="(offer, index) in filteredMerchantOffers" :key="`${offer.cropName}-${index}`" class="offer-detail-row">
                        <text class="cell-strong">{{ offer.cropName || '-' }}</text>
                        <text>{{ formatOfferAmount(offer.price, offer.unit) }}</text>
                        <text>{{ formatOfferAmount(offer.demand, offer.unit) }}</text>
                        <text>{{ formatOfferAmount(offer.minQuantity, offer.unit) }}</text>
                      </view>
                    </view>
                  </scroll-view>
                </view>
              </view>
            </view>
          </view>

          <view v-if="activeTab === 'market'" class="tab-pane">
            <view class="mini-kpi-grid">
              <view v-for="item in marketKpis" :key="item.label" class="mini-kpi">
                <text>{{ item.label }}</text><strong>{{ item.value }}</strong>
              </view>
            </view>
            <view class="workbench-grid market-grid">
              <section class="panel">
                <view class="panel-header compact">
                  <view>
                    <text class="panel-title">行情管理</text>
                    <text class="panel-subtitle">行情发布与预测结果合并管理</text>
                  </view>
                  <button class="btn-primary" @click="newMarketItem">发布行情</button>
                </view>
                <view class="table table-fixed-8">
                  <view class="table-head cols-market">
                    <text>作物</text><text>当前价</text><text>涨跌幅</text><text>市场状态</text><text>预测描述</text><text>更新时间</text><text>状态</text>
                  </view>
                  <view v-if="!marketItems.length" class="empty-row">暂无行情数据</view>
                  <view v-for="item in pagedMarketItems" :key="item.id" :class="['table-row cols-market clickable', marketForm.id === item.id ? 'is-selected' : '']" @click="editMarketItem(item)">
                    <text class="cell-strong ellipsis">{{ item.name }}</text>
                    <text>{{ item.currentPrice }} / {{ item.unit }}</text>
                    <text :class="['trend-text', getTrendClass(item.change)]">{{ formatSignedPercent(item.change) }}</text>
                    <text>{{ item.marketStatus }}</text>
                    <text class="ellipsis">{{ item.prediction }}</text>
                    <text>{{ formatDateTime(item.updatedAt || item.createdAt || '') }}</text>
                    <text><text :class="['badge', `status-${item.status || 'active'}`]">{{ formatMarketStatus(item.status || 'active') }}</text></text>
                  </view>
                  <view v-for="index in getPlaceholderRows(pagedMarketItems.length, marketPageSize)" :key="`market-empty-${index}`" class="table-row cols-market table-row-placeholder">
                    <text></text><text></text><text></text><text></text><text></text><text></text><text></text>
                  </view>
                </view>
                <view v-if="marketTotalPages > 1" class="table-pagination">
                  <text class="pagination-info">共 {{ marketItems.length }} 条，第 {{ marketPage }} / {{ marketTotalPages }} 页</text>
                  <view class="pagination-actions">
                    <button class="page-btn" :disabled="marketPage <= 1" @click="marketPage--">上一页</button>
                    <button class="page-btn" :disabled="marketPage >= marketTotalPages" @click="marketPage++">下一页</button>
                  </view>
                </view>
              </section>

              <aside class="panel sticky-panel">
                <view class="panel-tabs">
                  <button :class="['tab-btn', marketPanelTab === 'edit' ? 'is-active' : '']" @click="marketPanelTab = 'edit'">行情编辑</button>
                  <button :class="['tab-btn', marketPanelTab === 'forecast' ? 'is-active' : '']" @click="marketPanelTab = 'forecast'">价格预测</button>
                </view>

                <view v-if="marketPanelTab === 'edit'" class="form-stack panel-pad">
                  <view class="form-grid two-cols">
                    <label><text>作物名称</text><input v-model="marketForm.name" class="input" /></label>
                    <label><text>单位</text><input v-model="marketForm.unit" class="input" /></label>
                    <label><text>当前价</text><input v-model.number="marketForm.currentPrice" type="number" class="input" /></label>
                    <label><text>涨跌幅</text><input v-model.number="marketForm.change" type="number" class="input" /></label>
                    <label><text>均价</text><input v-model.number="marketForm.avgPrice" type="number" class="input" /></label>
                    <label><text>市场状态</text><input v-model="marketForm.marketStatus" class="input" /></label>
                    <label><text>周成交</text><input v-model.number="marketForm.weekVolume" type="number" class="input" /></label>
                    <label><text>月成交</text><input v-model.number="marketForm.monthVolume" type="number" class="input" /></label>
                  </view>
                  <label><text>预测描述</text><textarea v-model="marketForm.prediction" class="textarea small" /></label>
                  <label><text>销售建议</text><textarea v-model="marketForm.advice" class="textarea small" /></label>
                  <view class="action-row">
                    <button class="btn-primary" @click="saveMarket">保存行情</button>
                    <button :class="(marketForm.status || 'active') === 'active' ? 'btn-soft' : 'btn-secondary'" @click="toggleMarketStatus(marketForm)">
                      {{ (marketForm.status || 'active') === 'active' ? '停用行情' : '恢复行情' }}
                    </button>
                  </view>
                </view>

                <view v-if="marketPanelTab === 'forecast'" class="panel-pad forecast-box">
                  <label><text>预测商品</text><picker :range="spus" range-key="displayName" :value="selectedSpuIndex" @change="onSpuChange"><view class="picker-box">{{ selectedSpuLabel }}</view></picker></label>
                  <label><text>预测周期</text><picker :range="horizonOptions" :value="selectedHorizonIndex" @change="onHorizonChange"><view class="picker-box">{{ selectedHorizonLabel }}</view></picker></label>
                  <button class="btn-primary full" :loading="opsBusy" @click="runAdminForecastNow">执行预测</button>
                  <text v-if="opsMessage" class="ops-message">{{ opsMessage }}</text>
                  <view class="forecast-runs">
                    <text class="section-label">最近预测记录</text>
                    <view v-for="run in forecastRuns.slice(0, 5)" :key="run.id" class="compact-log">
                      <text>{{ run.displayName }}</text><text>{{ run.horizonDays }} 天 · {{ run.status }} · {{ formatPointPreview(run.pointPreview) }}</text>
                    </view>
                  </view>
                </view>
              </aside>
            </view>
          </view>

          <view v-if="activeTab === 'notifications'" class="tab-pane">
            <view class="workbench-grid notifications-grid">
              <section class="panel">
                <view class="panel-header compact">
                  <text class="panel-title">通知发布</text>
                </view>
                <view class="form-stack panel-pad">
                  <label><text>发送对象</text><picker :range="notificationUserOptions" :value="selectedNotificationUserIndex" @change="onNotificationUserChange"><view class="picker-box">{{ selectedNotificationUserLabel }}</view></picker></label>
                  <label><text>通知类型</text><picker :range="notificationTypeOptions" range-key="label" :value="selectedNotificationTypeIndex" @change="onNotificationTypeChange"><view class="picker-box">{{ selectedNotificationTypeLabel }}</view></picker></label>
                  <label><text>标题</text><input v-model="notificationForm.title" class="input" /></label>
                  <label><text>正文</text><textarea v-model="notificationForm.content" class="textarea" /></label>
                  <button class="btn-primary full" @click="createNotification">发布通知</button>
                </view>
              </section>

              <section class="panel">
                <view class="panel-header compact">
                  <view>
                    <text class="panel-title">通知历史</text>
                    <text class="panel-subtitle">系统、价格和买家通知触达记录</text>
                  </view>
                  <button class="btn-secondary" @click="markAdminNotificationsRead">全部已读</button>
                </view>
                <view class="notice-table-wrap">
                  <view class="notice-table-head notice-table-grid">
                    <text>类型</text>
                    <text>标题</text>
                    <text>正文</text>
                    <text>状态</text>
                    <text>时间</text>
                  </view>
                  <view v-if="!notifications.length" class="notice-empty-row">暂无通知</view>
                  <view v-for="item in pagedNotifications" :key="item.id" class="notice-table-row notice-table-grid">
                    <text class="notice-type-tag">{{ formatNotificationType(item.type) }}</text>
                    <text class="notice-title-cell">{{ item.title }}</text>
                    <button class="notice-content-btn" @click="openNoticeContentModal(item)">查看正文</button>
                    <text class="notice-status-tag" :class="item.read ? 'read' : 'unread'">{{ item.read ? '已读' : '未读' }}</text>
                    <text class="notice-time-cell">{{ formatShortDateTime(item.createdAt) }}</text>
                  </view>
                  <view v-for="index in getPlaceholderRows(pagedNotifications.length, notificationPageSize)" :key="`notification-empty-${index}`" class="notice-table-row notice-table-grid notice-table-row-placeholder">
                    <text></text><text></text><text></text><text></text><text></text>
                  </view>
                </view>
                <view v-if="notificationTotalPages > 1" class="table-pagination">
                  <text class="pagination-info">共 {{ notifications.length }} 条，第 {{ notificationPage }} / {{ notificationTotalPages }} 页</text>
                  <view class="pagination-actions">
                    <button class="page-btn" :disabled="notificationPage <= 1" @click="notificationPage--">上一页</button>
                    <button class="page-btn" :disabled="notificationPage >= notificationTotalPages" @click="notificationPage++">下一页</button>
                  </view>
                </view>
              </section>
            </view>

            <view v-if="noticeContentModalVisible" class="modal-mask" @click="closeNoticeContentModal">
              <view class="notice-content-modal" @click.stop>
                <view class="modal-header">
                  <text class="modal-title">通知正文</text>
                  <button class="modal-close" @click="closeNoticeContentModal">×</button>
                </view>
                <view class="modal-body">
                  <view class="notice-content-meta">
                    <view>
                      <text class="summary-label">标题</text>
                      <text class="summary-value">{{ selectedNotice?.title || '-' }}</text>
                    </view>
                    <view>
                      <text class="summary-label">类型</text>
                      <text class="summary-value">{{ formatNotificationType(selectedNotice?.type || '') }}</text>
                    </view>
                    <view>
                      <text class="summary-label">时间</text>
                      <text class="summary-value">{{ formatDateTime(selectedNotice?.createdAt) }}</text>
                    </view>
                  </view>
                  <view>
                    <text class="section-label">正文</text>
                    <scroll-view class="notice-content-body" scroll-y>
                      <text>{{ selectedNotice?.content?.trim() || '暂无正文内容' }}</text>
                    </scroll-view>
                  </view>
                </view>
              </view>
            </view>
          </view>

          <view v-if="activeTab === 'ops'" class="tab-pane">
            <view class="service-grid">
              <view v-for="service in serviceCards" :key="service.key" class="service-card">
                <view :class="['service-light', service.healthy ? 'ok' : 'bad']"></view>
                <text class="service-name">{{ service.label }}</text>
                <text class="service-detail">{{ service.detail }}</text>
                <text class="service-extra">{{ service.extra || '运行状态已记录' }}</text>
              </view>
            </view>

            <view class="ops-actions-grid">
              <section class="panel">
                <view class="panel-header compact"><text class="panel-title">手动预测</text></view>
                <view class="panel-pad form-stack">
                  <picker :range="spus" range-key="displayName" :value="selectedSpuIndex" @change="onSpuChange"><view class="picker-box">{{ selectedSpuLabel }}</view></picker>
                  <picker :range="horizonOptions" :value="selectedHorizonIndex" @change="onHorizonChange"><view class="picker-box">{{ selectedHorizonLabel }}</view></picker>
                  <button class="btn-primary full" :loading="opsBusy" @click="runAdminForecastNow">立即预测</button>
                </view>
              </section>
              <section class="panel">
                <view class="panel-header compact"><text class="panel-title">知识库同步</text></view>
                <view class="panel-pad ops-copy">
                  <text>同步行情资料与知识库状态，用于更新运营数据。</text>
                  <button class="btn-secondary full" :loading="opsBusy" @click="runManualRagCrawl">同步知识库</button>
                </view>
              </section>
              <section class="panel danger-panel">
                <view class="panel-header compact"><text class="panel-title">示例数据重置</text></view>
                <view class="panel-pad ops-copy">
                  <text>危险区域：将恢复系统初始示例数据。</text>
                  <button class="btn-danger full" :loading="opsBusy" @click="resetDemoDataNow">恢复示例数据</button>
                </view>
              </section>
            </view>
            <text v-if="opsMessage" class="ops-message block">{{ opsMessage }}</text>

            <section class="panel logs-panel">
              <view class="panel-tabs compact-tabs">
                <button :class="['tab-btn', opsLogTab === 'forecast' ? 'is-active' : '']" @click="switchOpsLogTab('forecast')">预测记录</button>
                <button :class="['tab-btn', opsLogTab === 'collection' ? 'is-active' : '']" @click="switchOpsLogTab('collection')">采集日志</button>
                <button :class="['tab-btn', opsLogTab === 'audit' ? 'is-active' : '']" @click="switchOpsLogTab('audit')">审计日志</button>
              </view>

              <view v-if="opsLogTab === 'forecast'" class="table-scroll">
                <view class="table-inner ops-table-wrap">
                <view class="table-head forecast-log-grid"><text>商品</text><text>周期</text><text>状态</text><text>预测方式</text><text>耗时</text><text>生成时间</text><text>价格预览</text></view>
                <view v-if="!forecastRuns.length" class="empty-row">暂无预测记录</view>
                <view v-for="run in pagedForecastRuns" :key="run.id" class="table-row forecast-log-grid"><text class="ellipsis">{{ run.displayName }}</text><text>{{ run.horizonDays }} 天</text><text>{{ cleanDisplayText(run.status) }}</text><text class="ellipsis">{{ formatForecastMethods(run.modelFamilies) }}</text><text>{{ run.inferenceMs }}ms</text><text>{{ formatDateTime(run.generatedAt) }}</text><text class="ellipsis">{{ formatPointPreview(run.pointPreview) }}</text></view>
                <view v-for="index in getPlaceholderRows(pagedForecastRuns.length, opsLogPageSize)" :key="`forecast-empty-${index}`" class="table-row forecast-log-grid table-row-placeholder">
                  <text></text><text></text><text></text><text></text><text></text><text></text><text></text>
                </view>
                </view>
                <view v-if="forecastRunTotalPages > 1" class="table-pagination">
                  <text class="pagination-info">共 {{ forecastRuns.length }} 条，第 {{ forecastRunPage }} / {{ forecastRunTotalPages }} 页</text>
                  <view class="pagination-actions">
                    <button class="page-btn" :disabled="forecastRunPage <= 1" @click="forecastRunPage--">上一页</button>
                    <button class="page-btn" :disabled="forecastRunPage >= forecastRunTotalPages" @click="forecastRunPage++">下一页</button>
                  </view>
                </view>
              </view>
              <view v-if="opsLogTab === 'collection'" class="table-scroll">
                <view class="table-inner ops-table-wrap">
                <view class="table-head collection-log-grid"><text>商品</text><text>来源</text><text>状态</text><text>响应</text><text>耗时</text><text>触发</text><text>时间</text></view>
                <view v-if="!collectionLogs.length" class="empty-row">暂无采集日志</view>
                <view v-for="log in pagedCollectionLogs" :key="log.id" class="table-row collection-log-grid"><text class="ellipsis">{{ log.displayName }}</text><text class="ellipsis">{{ cleanDisplayText(log.sourceName) }}</text><text>{{ cleanDisplayText(log.status) }}</text><text>{{ log.httpStatus || '-' }}</text><text>{{ log.durationMs || 0 }}ms</text><text>{{ cleanDisplayText(log.triggeredBy) }}</text><text>{{ formatDateTime(log.createdAt) }}</text></view>
                <view v-for="index in getPlaceholderRows(pagedCollectionLogs.length, opsLogPageSize)" :key="`collection-empty-${index}`" class="table-row collection-log-grid table-row-placeholder">
                  <text></text><text></text><text></text><text></text><text></text><text></text><text></text>
                </view>
                </view>
                <view v-if="collectionLogTotalPages > 1" class="table-pagination">
                  <text class="pagination-info">共 {{ collectionLogs.length }} 条，第 {{ collectionLogPage }} / {{ collectionLogTotalPages }} 页</text>
                  <view class="pagination-actions">
                    <button class="page-btn" :disabled="collectionLogPage <= 1" @click="collectionLogPage--">上一页</button>
                    <button class="page-btn" :disabled="collectionLogPage >= collectionLogTotalPages" @click="collectionLogPage++">下一页</button>
                  </view>
                </view>
              </view>
              <view v-if="opsLogTab === 'audit'" class="table-scroll">
                <view class="table-inner ops-table-wrap">
                <view class="table-head audit-log-grid"><text>操作人</text><text>类型</text><text>资源</text><text>详情</text><text>时间</text></view>
                <view v-if="!auditLogs.length" class="empty-row">暂无审计日志</view>
                <view v-for="log in pagedAuditLogs" :key="log.id" class="table-row audit-log-grid"><text>{{ log.userNickname || log.userPhone }}</text><text>{{ cleanDisplayText(log.actionType) }}</text><text>{{ cleanDisplayText(log.resourceType) }} {{ log.resourceId || '' }}</text><text class="ellipsis">{{ cleanDisplayText(log.detail || '-') }}</text><text>{{ formatDateTime(log.createdAt) }}</text></view>
                <view v-for="index in getPlaceholderRows(pagedAuditLogs.length, opsLogPageSize)" :key="`audit-empty-${index}`" class="table-row audit-log-grid table-row-placeholder">
                  <text></text><text></text><text></text><text></text><text></text>
                </view>
                </view>
                <view v-if="auditLogTotalPages > 1" class="table-pagination">
                  <text class="pagination-info">共 {{ auditLogs.length }} 条，第 {{ auditLogPage }} / {{ auditLogTotalPages }} 页</text>
                  <view class="pagination-actions">
                    <button class="page-btn" :disabled="auditLogPage <= 1" @click="auditLogPage--">上一页</button>
                    <button class="page-btn" :disabled="auditLogPage >= auditLogTotalPages" @click="auditLogPage++">下一页</button>
                  </view>
                </view>
              </view>
            </section>
          </view>
        </view>
      </scroll-view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useAuthStore } from '../../stores/auth'
import {
  auditAdminMerchant,
  createAdminNotification,
  crawlAdminRag,
  deleteAdminMerchant,
  getAdminAuditLogs,
  getAdminCollectionLogs,
  getAdminDashboard,
  getAdminForecastRuns,
  getAdminMarketItems,
  getAdminMerchants,
  getAdminNotifications,
  getAdminSpus,
  getAdminUsers,
  markAllAdminNotificationsRead,
  resetAdminDemoData,
  runAdminForecast,
  saveAdminMarketItem,
  saveAdminMerchant,
  updateAdminUserRole,
  type AdminCollectionLogItem,
  type AdminDashboardData,
  type AdminForecastRunItem,
  type AdminMarketItem,
  type AdminMerchantItem,
  type AdminSpuItem,
  type AdminUserItem,
  type NotificationItem,
} from '../../api/admin'

type AdminTab = 'overview' | 'users' | 'merchants' | 'market' | 'notifications' | 'ops'
type MarketPanelTab = 'edit' | 'forecast'
type OpsLogTab = 'forecast' | 'collection' | 'audit'

const authStore = useAuthStore()
const tabs: Array<{ key: AdminTab; label: string }> = [
  { key: 'overview', label: '控制台' },
  { key: 'users', label: '用户管理' },
  { key: 'merchants', label: '销路管理' },
  { key: 'market', label: '行情管理' },
  { key: 'notifications', label: '通知中心' },
  { key: 'ops', label: '系统运维' },
]

const activeTab = ref<AdminTab>('overview')
const currentTabLabel = computed(() => tabs.find((t) => t.key === activeTab.value)?.label || '')
const dashboard = ref<AdminDashboardData | null>(null)
const users = ref<AdminUserItem[]>([])
const merchants = ref<AdminMerchantItem[]>([])
const marketItems = ref<AdminMarketItem[]>([])
const notifications = ref<NotificationItem[]>([])
const spus = ref<AdminSpuItem[]>([])
const forecastRuns = ref<AdminForecastRunItem[]>([])
const collectionLogs = ref<AdminCollectionLogItem[]>([])
const auditLogs = ref<any[]>([])
const opsBusy = ref(false)
const opsMessage = ref('')
const userRoleBusyId = ref<number | null>(null)
const merchantAuditBusyId = ref<number | null>(null)
const selectedUser = ref<AdminUserItem | null>(null)
const marketPanelTab = ref<MarketPanelTab>('edit')
const opsLogTab = ref<OpsLogTab>('forecast')
const offerModalVisible = ref(false)
const selectedOfferMerchant = ref<AdminMerchantItem | null>(null)
const offerSearchKeyword = ref('')
const horizonOptions = [7, 30]
const selectedSpuIndex = ref(0)
const selectedHorizonIndex = ref(0)
const dashboardMarketPage = ref(1)
const dashboardMarketPageSize = 5
const userPage = ref(1)
const userPageSize = 8
const merchantPage = ref(1)
const merchantPageSize = 8
const marketPage = ref(1)
const marketPageSize = 8
const notificationPage = ref(1)
const notificationPageSize = 8
const forecastRunPage = ref(1)
const collectionLogPage = ref(1)
const auditLogPage = ref(1)
const opsLogPageSize = 8

const defaultMerchant = (): AdminMerchantItem => ({
  name: '',
  merchantType: 'comprehensive',
  contactName: '',
  contactPhone: '平台沟通',
  address: '',
  district: '',
  latitude: 37.4647,
  longitude: 121.4479,
  rating: 4.5,
  ordersCount: 0,
  badge: '推荐',
  businessHours: '',
  sourcePlatform: '平台维护',
  sourceUrl: '',
  sourceNote: '',
  status: 'pending',
  reviewNote: '',
  offers: [{ cropName: '苹果', price: 4.8, demand: 500, unit: '斤', minQuantity: 0 }],
})

const defaultMarket = (): AdminMarketItem => ({
  id: 0,
  name: '',
  currentPrice: 0,
  unit: '斤',
  change: 0,
  trend: 'stable',
  prediction: '预计维持平稳波动',
  advice: '建议结合本地询价分批出货',
  marketStatus: '供需平衡',
  avgPrice: 0,
  highPrice: 0,
  lowPrice: 0,
  weekVolume: 0,
  monthVolume: 0,
  userOwned: false,
  source: 'core',
  status: 'active',
})

const merchantForm = ref<AdminMerchantItem>(defaultMerchant())
const marketForm = ref<AdminMarketItem>(defaultMarket())
const notificationForm = ref<{ userId: number | null; type: string; title: string; content: string }>({
  userId: null,
  type: 'system',
  title: '',
  content: '',
})
const noticeContentModalVisible = ref(false)
const selectedNotice = ref<NotificationItem | null>(null)

const merchantStatusFilter = ref('all')
const merchantStatusOptions = [
  { label: '全部', value: 'all' },
  { label: '待审核', value: 'pending' },
  { label: '已通过', value: 'active' },
  { label: '已驳回', value: 'rejected' },
  { label: '已停用', value: 'inactive' },
]
const notificationTypeOptions = [
  { label: '系统通知', value: 'system' },
  { label: '价格行情', value: 'price' },
  { label: '买家互动', value: 'buyer' },
]

const selectedSpuId = computed(() => spus.value[selectedSpuIndex.value]?.spuId || '')
const selectedSpuLabel = computed(() => {
  const current = spus.value[selectedSpuIndex.value]
  if (!current) return '请选择预测商品'
  return `${current.displayName} (${current.spuId})`
})
const selectedHorizonLabel = computed(() => `${horizonOptions[selectedHorizonIndex.value] || 7} 天预测`)
const notificationUserOptions = computed(() => ['全部用户', ...users.value.map((user) => `${user.nickname || '未命名用户'} · ${user.phone}`)])
const selectedNotificationUserIndex = computed(() => {
  if (!notificationForm.value.userId) return 0
  const index = users.value.findIndex((user) => user.id === notificationForm.value.userId)
  return index >= 0 ? index + 1 : 0
})
const selectedNotificationUserLabel = computed(() => notificationUserOptions.value[selectedNotificationUserIndex.value] || '全部用户')
const selectedNotificationTypeIndex = computed(() => Math.max(0, notificationTypeOptions.findIndex((item) => item.value === notificationForm.value.type)))
const selectedNotificationTypeLabel = computed(() => notificationTypeOptions[selectedNotificationTypeIndex.value]?.label || '系统通知')
const overview = computed(() => dashboard.value?.overview)

const coreKpis = computed(() => [
  { key: 'users', label: '注册用户数', value: overview.value?.userCount || users.value.length || 0, note: '农户与管理账号' },
  { key: 'crops', label: '作物档案数', value: overview.value?.cropCount || 0, note: '已录入的作物资料' },
  { key: 'pending', label: '待审核商户', value: overview.value?.pendingMerchantCount || merchants.value.filter((m) => m.status === 'pending').length, note: '需要管理员处理' },
  { key: 'market', label: '活跃行情数', value: overview.value?.activeMarketItemCount || marketItems.value.filter((m) => (m.status || 'active') === 'active').length, note: '当前有效行情条目' },
])
const businessChain = computed(() => [
  { label: '农户注册', desc: `${overview.value?.userCount || users.value.length || 0} 个账号` },
  { label: '录入作物', desc: `${overview.value?.cropCount || 0} 份作物档案` },
  { label: '问诊与营销', desc: `${overview.value?.aiDiagnosisCount || 0} 次问诊 · ${overview.value?.adHistoryCount || 0} 条文案` },
  { label: '匹配商户', desc: `${overview.value?.activeMerchantCount || 0} 家通过审核商户` },
  { label: '查看行情', desc: `${overview.value?.activeMarketItemCount || 0} 条活跃行情可供参考` },
])
const serviceCards = computed(() => {
  const services = dashboard.value?.services
  if (!services) return []
  return [
    { key: 'api', label: '接口服务', healthy: services.api.healthy, detail: cleanServiceText(services.api.detail), baseUrl: services.api.baseUrl || '', extra: services.api.status ? `响应 ${services.api.status}` : '' },
    { key: 'scheduler', label: '调度服务', healthy: services.scheduler.healthy, detail: cleanServiceText(services.scheduler.detail), baseUrl: services.scheduler.baseUrl || '', extra: services.scheduler.enabled ? '自动采集与预测已启用' : '自动调度未启用' },
    { key: 'modelService', label: '预测服务', healthy: services.modelService.healthy, detail: cleanServiceText(services.modelService.detail), baseUrl: services.modelService.baseUrl || '', extra: services.modelService.latestForecastAt ? `最近预测 ${formatDateTime(services.modelService.latestForecastAt)}` : '暂无预测记录' },
    { key: 'lightRag', label: '知识库', healthy: services.lightRag.healthy, detail: cleanServiceText(services.lightRag.detail), baseUrl: services.lightRag.baseUrl || '', extra: services.lightRag.documentStatusCounts ? `资料状态：${Object.entries(services.lightRag.documentStatusCounts).map(([key, value]) => `${key}:${value}`).join('，')}` : '' },
  ]
})
const todoItems = computed(() => [
  { label: '待审核商户', value: overview.value?.pendingMerchantCount || merchants.value.filter((m) => m.status === 'pending').length, desc: '入驻资质与报价待确认', tab: 'merchants' as AdminTab, warn: true },
  { label: '异常服务', value: serviceCards.value.filter((item) => !item.healthy).length, desc: '服务健康检查异常数', tab: 'ops' as AdminTab, warn: serviceCards.value.some((item) => !item.healthy) },
  { label: '未读通知', value: overview.value?.unreadNotificationCount || notifications.value.filter((n) => !n.read).length, desc: '通知阅读状态积压', tab: 'notifications' as AdminTab, warn: false },
])
const merchantKpis = computed(() => [
  { label: '待审核商户', value: merchants.value.filter((m) => m.status === 'pending').length },
  { label: '已通过商户', value: merchants.value.filter((m) => m.status === 'active').length },
  { label: '已驳回商户', value: merchants.value.filter((m) => m.status === 'rejected').length },
  { label: '收购报价数', value: merchants.value.reduce((sum, item) => sum + (item.offers?.length || 0), 0) },
])
const filteredMerchantOffers = computed(() => {
  const offers = selectedOfferMerchant.value?.offers || []
  const keyword = offerSearchKeyword.value.trim().toLowerCase()
  if (!keyword) return offers
  return offers.filter((offer) => String(offer.cropName || '').toLowerCase().includes(keyword))
})
const dashboardMarketItems = computed(() => dashboard.value?.topMarketItems || [])
const pagedDashboardMarketItems = computed(() => getPagedList(dashboardMarketItems.value, dashboardMarketPage.value, dashboardMarketPageSize))
const dashboardMarketTotalPages = computed(() => getTotalPages(dashboardMarketItems.value.length, dashboardMarketPageSize))
const pagedUsers = computed(() => getPagedList(users.value, userPage.value, userPageSize))
const userTotalPages = computed(() => getTotalPages(users.value.length, userPageSize))
const pagedMerchants = computed(() => getPagedList(merchants.value, merchantPage.value, merchantPageSize))
const merchantTotalPages = computed(() => getTotalPages(merchants.value.length, merchantPageSize))
const pagedMarketItems = computed(() => getPagedList(marketItems.value, marketPage.value, marketPageSize))
const marketTotalPages = computed(() => getTotalPages(marketItems.value.length, marketPageSize))
const pagedNotifications = computed(() => getPagedList(notifications.value, notificationPage.value, notificationPageSize))
const notificationTotalPages = computed(() => getTotalPages(notifications.value.length, notificationPageSize))
const pagedForecastRuns = computed(() => getPagedList(forecastRuns.value, forecastRunPage.value, opsLogPageSize))
const forecastRunTotalPages = computed(() => getTotalPages(forecastRuns.value.length, opsLogPageSize))
const pagedCollectionLogs = computed(() => getPagedList(collectionLogs.value, collectionLogPage.value, opsLogPageSize))
const collectionLogTotalPages = computed(() => getTotalPages(collectionLogs.value.length, opsLogPageSize))
const pagedAuditLogs = computed(() => getPagedList(auditLogs.value, auditLogPage.value, opsLogPageSize))
const auditLogTotalPages = computed(() => getTotalPages(auditLogs.value.length, opsLogPageSize))
const marketKpis = computed(() => {
  const today = new Date().toDateString()
  const maxChange = marketItems.value.reduce((max, item) => Math.max(max, Number(item.change || 0)), 0)
  return [
    { label: '活跃行情', value: marketItems.value.filter((item) => (item.status || 'active') === 'active').length },
    { label: '今日更新', value: marketItems.value.filter((item) => item.updatedAt && new Date(item.updatedAt).toDateString() === today).length },
    { label: '最大涨幅', value: formatSignedPercent(maxChange) },
    { label: '预测记录', value: forecastRuns.value.length || overview.value?.forecastRunCount || 0 },
  ]
})

const getPagedList = <T,>(list: T[], page: number, pageSize: number) => {
  const start = (page - 1) * pageSize
  return list.slice(start, start + pageSize)
}
const getPlaceholderRows = (currentCount: number, pageSize: number) => {
  if (currentCount <= 0) return 0
  return Math.max(0, pageSize - currentCount)
}
const getTotalPages = (total: number, pageSize: number) => Math.max(1, Math.ceil(total / pageSize))
const clampPage = (pageRef: { value: number }, total: number, pageSize: number) => {
  const totalPages = getTotalPages(total, pageSize)
  if (pageRef.value > totalPages) pageRef.value = totalPages
  if (pageRef.value < 1) pageRef.value = 1
}
const clampDashboardMarketPage = () => clampPage(dashboardMarketPage, dashboardMarketItems.value.length, dashboardMarketPageSize)
const clampUserPage = () => clampPage(userPage, users.value.length, userPageSize)
const clampMerchantPage = () => clampPage(merchantPage, merchants.value.length, merchantPageSize)
const clampMarketPage = () => clampPage(marketPage, marketItems.value.length, marketPageSize)
const clampNotificationPage = () => clampPage(notificationPage, notifications.value.length, notificationPageSize)
const clampOpsPages = () => {
  clampPage(forecastRunPage, forecastRuns.value.length, opsLogPageSize)
  clampPage(collectionLogPage, collectionLogs.value.length, opsLogPageSize)
  clampPage(auditLogPage, auditLogs.value.length, opsLogPageSize)
}
const resetOpsLogPage = (tab: OpsLogTab) => {
  if (tab === 'forecast') forecastRunPage.value = 1
  if (tab === 'collection') collectionLogPage.value = 1
  if (tab === 'audit') auditLogPage.value = 1
}

const ensureAdminRole = () => {
  if (!authStore.isLoggedIn || !authStore.userInfo) {
    uni.redirectTo({ url: '/pages/login/index' })
    return false
  }
  const role = String(authStore.userInfo?.role || '')
  if (!['admin', 'demo'].includes(role)) {
    uni.showToast({ title: '没有后台访问权限', icon: 'none' })
    setTimeout(() => goBack(), 500)
    return false
  }
  return true
}

const loadOverview = async () => {
  dashboard.value = await getAdminDashboard()
  dashboardMarketPage.value = 1
  clampDashboardMarketPage()
}
const loadUsers = async () => {
  const data = await getAdminUsers()
  users.value = data.list
  userPage.value = 1
  clampUserPage()
  if (!selectedUser.value && users.value.length) selectedUser.value = users.value[0]
  if (selectedUser.value) selectedUser.value = users.value.find((user) => user.id === selectedUser.value?.id) || users.value[0] || null
}
const loadMerchants = async () => {
  const params = merchantStatusFilter.value === 'all' ? undefined : { status: merchantStatusFilter.value }
  const data = await getAdminMerchants(params)
  merchants.value = data.list
  merchantPage.value = 1
  clampMerchantPage()
  if (!merchantForm.value.id && merchants.value.length) editMerchant(merchants.value[0])
}
const loadMarketItems = async () => {
  const data = await getAdminMarketItems()
  marketItems.value = data.list
  marketPage.value = 1
  clampMarketPage()
  if ((!marketForm.value.id || !marketItems.value.some((item) => item.id === marketForm.value.id)) && marketItems.value.length) editMarketItem(marketItems.value[0])
}
const loadNotifications = async () => {
  const [notificationData, userData] = await Promise.all([
    getAdminNotifications({ type: 'all', pageSize: 100 }),
    users.value.length ? Promise.resolve({ list: users.value }) : getAdminUsers(),
  ])
  notifications.value = notificationData.list
  users.value = userData.list
  notificationPage.value = 1
  clampNotificationPage()
}
const loadOpsData = async () => {
  const [spuData, forecastData, collectionData, auditLogData] = await Promise.all([
    getAdminSpus(),
    getAdminForecastRuns(20),
    getAdminCollectionLogs(20),
    getAdminAuditLogs(30),
  ])
  spus.value = spuData.list
  forecastRuns.value = forecastData.list
  collectionLogs.value = collectionData.list
  auditLogs.value = auditLogData.list
  forecastRunPage.value = 1
  collectionLogPage.value = 1
  auditLogPage.value = 1
  clampOpsPages()
  if (selectedSpuIndex.value >= spus.value.length) selectedSpuIndex.value = 0
}
const loadOverviewContext = async () => {
  await Promise.allSettled([loadUsers(), loadMerchants(), loadMarketItems(), loadNotifications(), loadOpsData()])
}
const loadCurrentTab = async () => {
  if (!ensureAdminRole()) return
  try {
    if (activeTab.value === 'overview') {
      await loadOverview()
      await loadOverviewContext()
    }
    if (activeTab.value === 'users') await Promise.all([loadUsers(), loadOverview()])
    if (activeTab.value === 'merchants') await Promise.all([loadMerchants(), loadOverview()])
    if (activeTab.value === 'market') await Promise.all([loadMarketItems(), loadOpsData(), loadOverview()])
    if (activeTab.value === 'notifications') await Promise.all([loadNotifications(), loadOverview()])
    if (activeTab.value === 'ops') await Promise.all([loadOpsData(), loadOverview()])
  } catch (_error) {
    uni.showToast({ title: '加载失败', icon: 'none' })
  }
}

const switchTab = (tab: AdminTab) => {
  activeTab.value = tab
  void loadCurrentTab()
}
const switchOpsLogTab = (tab: OpsLogTab) => {
  opsLogTab.value = tab
  resetOpsLogPage(tab)
}
const selectUser = (user: AdminUserItem) => {
  selectedUser.value = user
}
const onMerchantFilterChange = (status: string) => {
  merchantStatusFilter.value = status
  merchantPage.value = 1
  void loadMerchants()
}
const newMerchant = () => {
  merchantForm.value = defaultMerchant()
}
const editMerchant = (merchant: AdminMerchantItem) => {
  merchantForm.value = JSON.parse(JSON.stringify(merchant))
  if (!merchantForm.value.offers) merchantForm.value.offers = []
}
const addOffer = () => {
  merchantForm.value.offers.push({ cropName: '', price: 0, demand: 0, unit: '斤', minQuantity: 0 })
}
const removeOffer = (index: number) => {
  merchantForm.value.offers.splice(index, 1)
}
const openOfferModal = (merchant: AdminMerchantItem) => {
  selectedOfferMerchant.value = merchant
  offerSearchKeyword.value = ''
  offerModalVisible.value = true
}
const closeOfferModal = () => {
  offerModalVisible.value = false
  selectedOfferMerchant.value = null
  offerSearchKeyword.value = ''
}
const saveMerchant = async () => {
  if (!merchantForm.value.name.trim()) {
    uni.showToast({ title: '请填写商户名称', icon: 'none' })
    return
  }
  await saveAdminMerchant(merchantForm.value)
  uni.showToast({ title: '已保存', icon: 'success' })
  await loadMerchants()
  await loadOverview()
}
const updateUserRoleNow = async (userId: number, role: 'user' | 'demo' | 'admin') => {
  userRoleBusyId.value = userId
  try {
    await updateAdminUserRole({ userId, role })
    uni.showToast({ title: '角色已更新', icon: 'success' })
    await Promise.all([loadUsers(), loadOverview(), loadNotifications()])
  } catch (_error) {
    uni.showToast({ title: '角色更新失败', icon: 'none' })
  } finally {
    userRoleBusyId.value = null
  }
}
const removeMerchant = async (merchant: AdminMerchantItem) => {
  if (!merchant.id) return
  await deleteAdminMerchant(merchant.id)
  uni.showToast({ title: '已停用', icon: 'none' })
  await loadMerchants()
  await loadOverview()
}
const auditMerchantNow = async (merchant: AdminMerchantItem, status: 'active' | 'rejected') => {
  if (!merchant.id) return
  uni.showModal({
    title: status === 'active' ? '通过审核' : '驳回审核',
    editable: true,
    placeholderText: '请输入审核备注',
    content: status === 'active' ? '审核通过' : '审核不通过',
    success: async (res) => {
      if (res.confirm) {
        merchantAuditBusyId.value = merchant.id!
        try {
          const reviewNote = res.content || merchant.reviewNote || (status === 'active' ? '管理员审核通过' : '管理员审核驳回')
          await auditAdminMerchant({ id: merchant.id!, status, reviewNote })
          uni.showToast({ title: status === 'active' ? '已通过' : '已驳回', icon: 'success' })
          await Promise.all([loadMerchants(), loadOverview()])
        } catch (_error) {
          uni.showToast({ title: '审核失败', icon: 'none' })
        } finally {
          merchantAuditBusyId.value = null
        }
      }
    },
  })
}
const newMarketItem = () => {
  marketForm.value = defaultMarket()
  marketPanelTab.value = 'edit'
}
const editMarketItem = (item: AdminMarketItem) => {
  marketForm.value = JSON.parse(JSON.stringify(item))
  marketPanelTab.value = 'edit'
}
const saveMarket = async () => {
  if (!marketForm.value.name.trim()) {
    uni.showToast({ title: '请填写作物名称', icon: 'none' })
    return
  }
  await saveAdminMarketItem(marketForm.value)
  uni.showToast({ title: '已保存', icon: 'success' })
  await loadMarketItems()
  await loadOverview()
}
const toggleMarketStatus = async (item: AdminMarketItem) => {
  if (!item.id) return
  const nextStatus = (item.status || 'active') === 'active' ? 'inactive' : 'active'
  const actionText = nextStatus === 'active' ? '恢复' : '停用'

  try {
    const payload: AdminMarketItem = {
      ...item,
      status: nextStatus,
    }
    await saveAdminMarketItem(payload)
    uni.showToast({ title: `行情已${actionText}`, icon: 'success' })
    await loadMarketItems()
    const refreshedItem = marketItems.value.find((marketItem) => marketItem.id === item.id)
    if (refreshedItem) marketForm.value = JSON.parse(JSON.stringify(refreshedItem))
    await loadOverview()
  } catch (_error) {
    uni.showToast({ title: `${actionText}失败`, icon: 'none' })
  }
}
const createNotification = async () => {
  if (!notificationForm.value.title.trim() || !notificationForm.value.content.trim()) {
    uni.showToast({ title: '请填写标题和内容', icon: 'none' })
    return
  }
  await createAdminNotification(notificationForm.value)
  notificationForm.value = { userId: null, type: 'system', title: '', content: '' }
  uni.showToast({ title: '已发布', icon: 'success' })
  await loadNotifications()
  await loadOverview()
}
const markAdminNotificationsRead = async () => {
  await markAllAdminNotificationsRead('all')
  uni.showToast({ title: '已全部已读', icon: 'success' })
  await loadNotifications()
  await loadOverview()
}
const openNoticeContentModal = (notice: NotificationItem) => {
  selectedNotice.value = notice
  noticeContentModalVisible.value = true
}
const closeNoticeContentModal = () => {
  noticeContentModalVisible.value = false
  selectedNotice.value = null
}
const onSpuChange = (event: { detail: { value: string } }) => {
  selectedSpuIndex.value = Number(event.detail.value || 0)
}
const onHorizonChange = (event: { detail: { value: string } }) => {
  selectedHorizonIndex.value = Number(event.detail.value || 0)
}
const onNotificationUserChange = (event: { detail: { value: string } }) => {
  const index = Number(event.detail.value || 0)
  notificationForm.value.userId = index <= 0 ? null : users.value[index - 1]?.id || null
}
const onNotificationTypeChange = (event: { detail: { value: string } }) => {
  const index = Number(event.detail.value || 0)
  notificationForm.value.type = notificationTypeOptions[index]?.value || 'system'
}
const runManualForecastNow = async () => {
  if (!selectedSpuId.value) {
    uni.showToast({ title: '请选择预测商品', icon: 'none' })
    return
  }
  opsBusy.value = true
  uni.showLoading({ title: '预测执行中' })
  try {
    const horizonDays = horizonOptions[selectedHorizonIndex.value] || 7
    const data = await runAdminForecast({ spuId: selectedSpuId.value, horizonDays })
    opsMessage.value = `预测完成：${selectedSpuLabel.value} · ${horizonDays} 天 · 状态 ${data.result?.status || data.latest?.status || 'unknown'}`
    await Promise.all([loadOpsData(), loadOverview()])
    uni.showToast({ title: '预测已执行', icon: 'success' })
  } catch (error: any) {
    opsMessage.value = `预测执行失败：${error?.message || '未知错误'}`
    uni.showToast({ title: '预测失败', icon: 'none' })
  } finally {
    uni.hideLoading()
    opsBusy.value = false
  }
}
const runAdminForecastNow = runManualForecastNow
const runManualRagCrawl = async () => {
  opsBusy.value = true
  uni.showLoading({ title: '知识库同步中' })
  try {
    const data = await crawlAdminRag()
    opsMessage.value = `知识库同步完成：资料 ${data.totalDocs}，处理 ${data.totalChunks}，完成于 ${formatDateTime(data.finishedAt)}`
    await loadOverview()
    uni.showToast({ title: '同步完成', icon: 'success' })
  } catch (error: any) {
    opsMessage.value = `知识库同步失败：${error?.message || '未知错误'}`
    uni.showToast({ title: '同步失败', icon: 'none' })
  } finally {
    uni.hideLoading()
    opsBusy.value = false
  }
}
const resetDemoDataNow = async () => {
  opsBusy.value = true
  uni.showLoading({ title: '重置中' })
  try {
    await resetAdminDemoData()
    opsMessage.value = '示例数据已恢复'
    await Promise.all([loadOverview(), loadUsers(), loadMerchants(), loadMarketItems(), loadNotifications(), loadOpsData()])
    uni.showToast({ title: '已恢复', icon: 'success' })
  } catch (error: any) {
    opsMessage.value = `重置失败：${error?.message || '未知错误'}`
    uni.showToast({ title: '重置失败', icon: 'none' })
  } finally {
    uni.hideLoading()
    opsBusy.value = false
  }
}

const formatDateTime = (value?: string) => {
  if (!value) return '-'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '-'
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
const formatShortDateTime = (value?: string) => {
  if (!value) return '-'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '-'
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
const formatSignedPercent = (value: number) => {
  const numberValue = Number(value || 0)
  if (numberValue > 0) return `+${numberValue.toFixed(1)}%`
  return `${numberValue.toFixed(1)}%`
}
const getTrendClass = (value: number) => {
  const numberValue = Number(value || 0)
  if (numberValue > 0) return 'trend-up'
  if (numberValue < 0) return 'trend-down'
  return 'trend-stable'
}
const formatPointPreview = (values: number[]) => {
  if (!Array.isArray(values) || !values.length) return '暂无'
  return values.map((item) => Number(item).toFixed(2)).join(' / ')
}
const formatRole = (role: string) => {
  if (role === 'admin') return '管理员'
  if (role === 'demo') return '体验账号'
  return '普通用户'
}
const formatStatus = (status?: string) => {
  if (status === 'active') return '已通过'
  if (status === 'pending') return '待审核'
  if (status === 'rejected') return '已驳回'
  if (status === 'inactive') return '已停用'
  return status || '-'
}
const formatMarketStatus = (status?: string) => {
  if ((status || 'active') === 'active') return '启用中'
  if (status === 'inactive') return '已停用'
  return status || '-'
}
const formatNotificationType = (type: string) => notificationTypeOptions.find((item) => item.value === type)?.label || type
const cleanDisplayText = (value?: string | null) =>
  String(value || '运行状态正常')
    .replace(/LightRAG/gi, '知识库')
    .replace(/model service/gi, '预测服务')
    .replace(/model/gi, '预测')
    .replace(/chunk/gi, '资料处理')
    .replace(/chunks/gi, '资料处理')
    .replace(/切片/g, '资料处理')
    .replace(/baseUrl/gi, '服务地址')
    .replace(/demo/gi, '体验')
    .replace(/AI/g, '智能')
const cleanServiceText = cleanDisplayText
const formatForecastMethods = (families?: string[]) => {
  if (!families?.length) return '系统预测'
  return families.map((item) => cleanDisplayText(item)).join('、')
}
const formatOfferCount = (merchant: AdminMerchantItem) => {
  const count = merchant.offers?.length || 0
  return count ? `共 ${count} 条报价` : '暂无报价'
}
const formatOfferAmount = (value: number, unit: string) => `${Number(value || 0)} ${unit || ''}`.trim()
const handleLogout = async () => {
  uni.showModal({
    title: '退出登录',
    content: '确定要退出管理端吗？',
    success: async (res) => {
      if (res.confirm) {
        await authStore.logout()
        uni.reLaunch({ url: '/pages/login/index' })
      }
    },
  })
}
const goBack = () => {
  const pages = getCurrentPages()
  if (pages.length > 1) {
    uni.navigateBack()
    return
  }
  uni.reLaunch({ url: '/pages/login/index' })
}

onLoad(() => {
  if (!ensureAdminRole()) return
  void loadCurrentTab()
})
</script>

<style scoped lang="scss">
.admin-app {
  display: flex;
  height: 100vh;
  min-width: 1180px;
  background: var(--acm-bg-app);
  color: var(--acm-text-primary);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}

.app-sidebar {
  width: 220px;
  flex: 0 0 220px;
  background: var(--acm-brand-primary-dark);
  color: var(--acm-bg-app);
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.sidebar-brand {
  height: 72px;
  padding: 0 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid rgba(244, 214, 132, 0.18);
}

.brand-mark {
  width: 40px;
  height: 40px;
  border-radius: 14px;
  background: var(--acm-harvest-gold);
  color: var(--acm-brand-primary-dark);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 800;
}

.brand-copy,
.panel-title,
.panel-subtitle,
.kpi-label,
.kpi-value,
.kpi-note,
.nav-label,
.identity-label,
.identity-value,
.service-name,
.service-detail,
.service-extra,
.profile-name,
.profile-meta,
.section-label,
.ops-message,
.todo-label,
.todo-desc,
.todo-value,
.chain-title,
.chain-desc,
.feed-title,
.feed-desc,
.feed-time,
.empty-row,
.empty-panel {
  display: block;
}

.brand-name { font-size: 18px; font-weight: 800; }
.brand-subtitle { margin-top: 3px; font-size: 12px; color: rgba(248, 243, 232, 0.7); }

.sidebar-nav {
  flex: 1;
  padding: 18px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.nav-item {
  height: 44px;
  padding: 0 14px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: rgba(248, 243, 232, 0.72);
  cursor: pointer;
}

.nav-item.is-active,
.nav-item:hover { background: rgba(244, 214, 132, 0.14); color: var(--acm-text-inverse); }
.nav-dot { width: 7px; height: 7px; border-radius: 50%; background: rgba(244, 214, 132, 0.5); }
.nav-item.is-active .nav-dot { background: var(--acm-harvest-gold); }
.nav-label { font-size: 15px; font-weight: 650; }

.sidebar-footer { margin-top: auto; padding: 18px; border-top: 1px solid rgba(244, 214, 132, 0.16); }
.identity-label { color: rgba(248, 243, 232, 0.58); font-size: 12px; }
.identity-value { margin-top: 4px; font-size: 13px; color: var(--acm-text-inverse); }

.sidebar-actions {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sidebar-action-btn {
  width: 100%;
  height: 42px;
  padding: 0;
  margin: 0;
  line-height: 1;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  cursor: pointer;
}
.sidebar-action-btn::after { border: none; }

.sidebar-action-refresh {
  background: #ffffff;
  border: 1px solid #d9d6cc;
  color: #1f5f3a;
}

.sidebar-action-logout {
  background: #fff7f7;
  border: 1px solid #f0c9c9;
  color: #b42318;
}

button { margin: 0; line-height: 1; }
button::after { border: none; }
.btn-primary,
.btn-secondary,
.btn-soft,
.btn-danger,
.btn-ghost,
.tab-btn,
.filter-btn {
  border: 0;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 700;
  height: 38px;
  padding: 0 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.btn-primary { background: var(--acm-brand-primary); color: var(--acm-text-inverse); }
.btn-secondary { background: var(--acm-soil-earth-soft); color: var(--acm-brand-primary-dark); }
.btn-soft { background: var(--acm-bg-card-soft); color: var(--acm-soil-earth); }
.btn-danger { background: var(--acm-danger-text); color: var(--acm-text-inverse); }
.btn-ghost { height: 32px; background: transparent; color: var(--acm-warning-text); padding: 0 8px; }
.full { width: 100%; }
.tiny { height: 34px; padding: 0 10px; font-size: 12px; }

.app-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.app-content { flex: 1; }
.content-inner { max-width: 1500px; padding: 24px; margin: 0 auto; box-sizing: border-box; }
.tab-pane { display: flex; flex-direction: column; gap: 18px; }

.kpi-grid,
.mini-kpi-grid,
.service-grid { display: grid; gap: 18px; }
.kpi-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.kpi-card {
  height: 120px;
  padding: 18px 20px;
  border-radius: 16px;
  background: var(--acm-bg-card);
  border: 1px solid var(--acm-border-soft);
  box-sizing: border-box;
  box-shadow: 0 12px 28px rgba(32, 62, 43, 0.06);
}
.kpi-label { font-size: 13px; color: var(--acm-text-secondary); }
.kpi-value { margin-top: 12px; font-size: 26px; line-height: 1; font-weight: 850; color: var(--acm-brand-primary-dark); }
.kpi-note { margin-top: 14px; font-size: 12px; color: var(--acm-warning-text); }

.panel,
.service-card,
.mini-kpi {
  background: var(--acm-bg-card);
  border: 1px solid var(--acm-border-soft);
  border-radius: 16px;
  box-shadow: 0 12px 28px rgba(32, 62, 43, 0.05);
  overflow: hidden;
}
.panel-header {
  min-height: 64px;
  padding: 18px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--acm-border-soft);
  box-sizing: border-box;
}
.panel-header.compact { min-height: 58px; }
.panel-title { font-size: 18px; font-weight: 800; color: var(--acm-brand-primary-dark); }
.panel-subtitle { margin-top: 4px; font-size: 12px; color: var(--acm-text-secondary); }
.panel-pad { padding: 18px 20px; }

.split-grid,
.workbench-grid { display: grid; gap: 18px; align-items: start; }
.split-grid { grid-template-columns: 65fr 35fr; }
.users-grid { grid-template-columns: 70fr 30fr; }
.merchants-grid { grid-template-columns: 62fr 38fr; }
.market-grid { grid-template-columns: 58fr 42fr; }
.notifications-grid { grid-template-columns: 38fr 62fr; }
.sticky-panel { position: sticky; top: 0; }

.chain-row { padding: 22px 20px; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
.chain-step { position: relative; min-height: 132px; padding: 16px; border-radius: 14px; background: var(--acm-bg-harvest-soft); border: 1px solid var(--acm-border-warning); box-sizing: border-box; }
.chain-index { width: 28px; height: 28px; border-radius: 10px; background: var(--acm-brand-primary); color: var(--acm-text-inverse); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 800; }
.chain-title { margin-top: 14px; font-size: 15px; font-weight: 800; color: var(--acm-brand-primary-dark); }
.chain-desc { margin-top: 7px; font-size: 12px; line-height: 1.5; color: var(--acm-text-secondary); }
.chain-arrow { position: absolute; right: -16px; top: 48px; color: var(--acm-harvest-gold); font-size: 20px; z-index: 2; }

.todo-list { padding: 10px 18px 18px; }
.todo-item { min-height: 72px; display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 1px solid var(--acm-border-soft); cursor: pointer; }
.todo-label { font-size: 14px; font-weight: 800; color: var(--acm-text-primary); }
.todo-desc { margin-top: 5px; font-size: 12px; color: var(--acm-text-secondary); }
.todo-value { font-size: 24px; font-weight: 850; color: var(--acm-brand-primary); }
.todo-value.warn { color: var(--acm-fruit-orange); }

.table { width: 100%; }
.table-scroll { overflow-x: auto; }
.table-inner { min-width: max-content; }
.dashboard-market-table { min-width: 700px; }
.user-table-wrap { min-width: 920px; }
.ops-table-wrap { min-width: 860px; }
.table-fixed-5 { min-height: calc(44px + 5 * 68px); }
.table-fixed-8 { min-height: calc(44px + 8 * 68px); }
.table-head,
.table-row { display: grid; align-items: center; column-gap: 14px; min-width: max-content; }
.table-head { height: 44px; padding: 0 16px; background: #f6f4ec; color: #6b7280; font-size: 13px; font-weight: 600; border-bottom: 1px solid #e5e2d8; box-sizing: border-box; }
.table-row { min-height: 68px; padding: 0 16px; border-bottom: 1px solid #f0eee6; font-size: 13px; color: var(--acm-text-regular); box-sizing: border-box; }
.table-row.clickable { cursor: pointer; }
.table-row.is-selected { background: var(--acm-bg-harvest-soft); }
.compact-table .table-row { min-height: 48px; }
.dense .table-row { min-height: 58px; }
.table-row-placeholder {
  pointer-events: none;
  background: transparent;
}
.table-row-placeholder text {
  visibility: hidden;
}
.cell-strong { font-weight: 800; color: var(--acm-brand-primary-dark); }
.ellipsis { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.empty-row,
.empty-panel { padding: 24px 16px; color: var(--acm-text-secondary); font-size: 13px; }

/* ---- 表格列宽 ---- */
.dashboard-market-grid { grid-template-columns: minmax(120px, 1.2fr) 110px 100px minmax(120px, 1fr) 150px; }
.user-table-grid { grid-template-columns: minmax(160px, 1.4fr) 130px 110px 90px 72px 72px 72px 80px 80px; }
.forecast-log-grid { grid-template-columns: minmax(150px, 1.4fr) 90px 96px minmax(120px, 1fr) 90px minmax(140px, 1.2fr) 150px; }
.collection-log-grid { grid-template-columns: minmax(130px, 1.2fr) minmax(140px, 1.2fr) 96px 86px 86px minmax(180px, 1.6fr) 150px; }
.audit-log-grid { grid-template-columns: minmax(130px, 1.1fr) 120px 120px minmax(260px, 2fr) 150px; }

.table-number-cell {
  text-align: center;
}

.cols-merchants { grid-template-columns: 150px 88px 116px 130px 130px 82px 76px; }
.cols-market { grid-template-columns: minmax(120px, 1.2fr) 110px 100px 110px minmax(160px, 1.4fr) 150px 90px; }

/* ========== 通知记录表格（统一 grid 布局）========== */
.notice-table-wrap { width: 100%; }
.notice-table-grid {
  display: grid;
  grid-template-columns: 110px minmax(180px, 1.4fr) 110px 90px 150px;
  column-gap: 16px;
  align-items: center;
}
.notice-table-head,
.notice-table-row { min-height: 56px; align-items: center; }
.notice-table-head {
  height: 44px;
  min-height: 44px;
  padding: 0 16px;
  background: var(--acm-bg-harvest-soft);
  color: var(--acm-text-secondary);
  font-size: 13px;
  font-weight: 600;
  border-radius: 8px 8px 0 0;
  box-sizing: border-box;
}
.notice-table-row {
  min-height: 56px;
  padding: 0 16px;
  border-bottom: 1px solid var(--acm-border-soft);
  box-sizing: border-box;
}
.notice-table-row-placeholder { pointer-events: none; }
.notice-table-row-placeholder text { visibility: hidden; }
.notice-title-cell {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-weight: 800;
  color: var(--acm-brand-primary-dark);
  font-size: 13px;
}
.notice-type-tag,
.notice-status-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: fit-content;
  min-width: 64px;
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
  box-sizing: border-box;
}
.notice-type-tag {
  background: var(--acm-neutral-soft);
  color: var(--acm-neutral-text);
}
.notice-status-tag.read {
  background: var(--acm-success-soft);
  color: var(--acm-brand-primary);
}
.notice-status-tag.unread {
  background: var(--acm-warning-soft);
  color: var(--acm-warning-text);
}
.notice-content-btn {
  width: 78px;
  height: 30px;
  padding: 0;
  font-size: 13px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--acm-warning-text);
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.notice-time-cell {
  white-space: nowrap;
  color: var(--acm-text-secondary);
  font-size: 13px;
}
.notice-empty-row {
  padding: 32px 16px;
  text-align: center;
  color: var(--acm-text-secondary);
  font-size: 13px;
  border-bottom: 1px solid var(--acm-border-soft);
}

.badge { display: inline-flex; height: 24px; align-items: center; padding: 0 9px; border-radius: 8px; font-size: 12px; font-weight: 800; }
.role-admin { background: var(--acm-success-soft); color: var(--acm-brand-primary); }
.role-demo { background: var(--acm-warning-soft); color: var(--acm-warning-text); }
.role-user { background: var(--acm-neutral-soft); color: var(--acm-neutral-text); }
.status-active,
.read { background: var(--acm-success-soft); color: var(--acm-brand-primary); }
.status-pending,
.unread { background: var(--acm-warning-soft); color: var(--acm-warning-text); }
.status-rejected { background: var(--acm-danger-soft); color: var(--acm-danger-text); }
.status-inactive { background: var(--acm-neutral-soft); color: var(--acm-neutral-text); }
.trend-text.trend-up { color: var(--acm-price-up); font-weight: 800; }
.trend-text.trend-down { color: var(--acm-danger-text); font-weight: 800; }
.trend-text.trend-stable { color: var(--acm-neutral-text); font-weight: 800; }

.profile-block { padding: 20px; border-bottom: 1px solid var(--acm-border-soft); }
.profile-name { font-size: 22px; font-weight: 850; color: var(--acm-brand-primary-dark); }
.profile-meta { margin-top: 8px; font-size: 13px; color: var(--acm-text-secondary); }
.detail-stack { display: flex; flex-direction: column; }
.metric-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; padding: 18px 20px; }
.metric-grid view { padding: 14px; border-radius: 14px; background: var(--acm-bg-harvest-soft); }
.metric-grid text { display: block; font-size: 22px; font-weight: 850; color: var(--acm-brand-primary-dark); }
.metric-grid span { display: block; margin-top: 6px; font-size: 12px; color: var(--acm-text-secondary); }
.detail-section { padding: 18px 20px; display: flex; flex-direction: column; gap: 12px; }
.section-label { font-size: 13px; font-weight: 850; color: var(--acm-soil-earth); }

.mini-kpi-grid { grid-template-columns: repeat(4, 1fr); }
.mini-kpi { height: 86px; padding: 16px 18px; box-sizing: border-box; }
.mini-kpi text { display: block; font-size: 13px; color: var(--acm-text-secondary); }
.mini-kpi strong { display: block; margin-top: 10px; font-size: 22px; color: var(--acm-brand-primary-dark); }
.filter-bar { display: flex; gap: 10px; padding: 14px 18px; border-bottom: 1px solid var(--acm-border-soft); }
.filter-btn { height: 32px; background: var(--acm-soil-earth-soft); color: var(--acm-text-secondary); font-size: 13px; }
.filter-btn.is-active { background: var(--acm-brand-primary); color: var(--acm-text-inverse); }
.table-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 52px;
  padding: 10px 16px;
  border-top: 1px solid var(--acm-border-soft);
  background: var(--acm-bg-elevated);
  box-sizing: border-box;
}
.pagination-info {
  font-size: 13px;
  color: var(--acm-text-secondary);
}
.pagination-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.page-btn {
  min-width: 72px;
  height: 32px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--acm-border-strong);
  background: var(--acm-bg-card);
  color: var(--acm-brand-primary-dark);
  font-size: 13px;
  font-weight: 700;
}
.page-btn[disabled] {
  opacity: 0.42;
  color: var(--acm-text-secondary);
  cursor: not-allowed;
}
.offer-summary {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 6px;
  min-width: 0;
}
.offer-summary text {
  font-size: 13px;
  color: var(--acm-text-regular);
  white-space: nowrap;
}
.offer-summary .btn-ghost {
  height: 22px;
  padding: 0;
  color: var(--acm-warning-text);
  font-size: 12px;
  background: transparent;
}

.form-stack { display: flex; flex-direction: column; gap: 14px; }
.form-grid { display: grid; gap: 12px; }
.two-cols { grid-template-columns: repeat(2, minmax(0, 1fr)); }
label text { display: block; margin-bottom: 7px; font-size: 12px; font-weight: 800; color: var(--acm-soil-earth); }
.input,
.textarea,
.picker-box {
  width: 100%;
  min-height: 38px;
  padding: 0 12px;
  border-radius: 12px;
  border: 1px solid var(--acm-border-strong);
  background: var(--acm-bg-elevated);
  color: var(--acm-text-primary);
  font-size: 14px;
  box-sizing: border-box;
}
.textarea { height: 132px; padding: 10px 12px; line-height: 1.5; }
.textarea.small { height: 78px; }
.picker-box { display: flex; align-items: center; }
.offer-header,
.action-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.action-row.wrap { flex-wrap: wrap; justify-content: flex-start; }
.offer-row { display: grid; grid-template-columns: 1.2fr 0.8fr 0.8fr 62px 56px; gap: 8px; align-items: center; }

.panel-tabs { height: 56px; padding: 8px; display: flex; gap: 8px; border-bottom: 1px solid var(--acm-border-soft); box-sizing: border-box; }
.compact-tabs { height: 50px; }
.tab-btn { flex: 1; height: 40px; background: var(--acm-soil-earth-soft); color: var(--acm-text-secondary); }
.tab-btn.is-active { background: var(--acm-brand-primary); color: var(--acm-text-inverse); }
.forecast-box { display: flex; flex-direction: column; gap: 14px; }
.forecast-runs { margin-top: 4px; display: flex; flex-direction: column; gap: 8px; }
.compact-log { padding: 10px 12px; border-radius: 12px; background: var(--acm-bg-harvest-soft); }
.compact-log text:first-child { display: block; font-size: 13px; font-weight: 800; color: var(--acm-text-primary); }
.compact-log text:last-child { display: block; margin-top: 4px; font-size: 12px; color: var(--acm-text-secondary); }

.service-grid { grid-template-columns: repeat(4, 1fr); }
.service-card { min-height: 124px; padding: 18px; box-sizing: border-box; position: relative; }
.service-light { width: 10px; height: 10px; border-radius: 50%; position: absolute; right: 18px; top: 18px; }
.service-light.ok { background: var(--acm-success); box-shadow: 0 0 0 4px rgba(47, 139, 80, 0.12); }
.service-light.bad { background: var(--acm-danger-text); box-shadow: 0 0 0 4px rgba(164, 60, 47, 0.12); }
.service-name { font-size: 16px; font-weight: 850; color: var(--acm-brand-primary-dark); }
.service-detail { margin-top: 10px; font-size: 13px; color: var(--acm-soil-earth); line-height: 1.45; }
.service-extra { margin-top: 8px; font-size: 12px; color: var(--acm-warning-text); }
.ops-actions-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
.ops-copy { min-height: 154px; display: flex; flex-direction: column; justify-content: space-between; gap: 16px; }
.ops-copy text { font-size: 14px; line-height: 1.6; color: var(--acm-text-regular); }
.danger-panel { border-color: var(--acm-danger-soft); background: var(--acm-bg-card); }
.ops-message { font-size: 13px; color: var(--acm-warning-text); }
.ops-message.block { padding: 0 4px; }
.logs-panel { max-height: 560px; }

.audit-feed { padding: 8px 18px 18px; }
.feed-row { min-height: 64px; padding: 10px 0; border-bottom: 1px solid var(--acm-border-soft); box-sizing: border-box; }
.feed-title { font-size: 13px; font-weight: 850; color: var(--acm-text-primary); }
.feed-desc { margin-top: 4px; font-size: 12px; color: var(--acm-text-secondary); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.feed-time { margin-top: 4px; font-size: 12px; color: var(--acm-warning-text); }

.modal-mask {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(23, 61, 43, 0.42);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  box-sizing: border-box;
}

.offer-modal {
  width: min(920px, calc(100vw - 80px));
  max-height: 70vh;
  background: var(--acm-bg-card);
  border-radius: 16px;
  border: 1px solid var(--acm-border-soft);
  box-shadow: 0 28px 80px rgba(23, 61, 43, 0.28);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.notice-content-modal {
  width: min(680px, calc(100vw - 48px));
  max-height: 70vh;
  background: var(--acm-bg-card);
  border-radius: 16px;
  border: 1px solid var(--acm-border-soft);
  box-shadow: 0 28px 80px rgba(23, 61, 43, 0.28);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  height: 58px;
  padding: 0 18px 0 22px;
  border-bottom: 1px solid var(--acm-border-soft);
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
}

.modal-title {
  font-size: 18px;
  font-weight: 850;
  color: var(--acm-brand-primary-dark);
}

.modal-close {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 0;
  background: var(--acm-soil-earth-soft);
  color: var(--acm-neutral-text);
  font-size: 22px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-body {
  padding: 18px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
}

.merchant-summary-card {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr 1fr 1.6fr 0.8fr;
  gap: 12px;
  padding: 14px;
  border-radius: 14px;
  background: var(--acm-bg-harvest-soft);
  border: 1px solid var(--acm-border-warning);
}

.notice-content-meta {
  display: grid;
  grid-template-columns: 1.4fr 0.8fr 1fr;
  gap: 12px;
  padding: 14px;
  border-radius: 14px;
  background: var(--acm-bg-harvest-soft);
  border: 1px solid var(--acm-border-warning);
}

.notice-content-body {
  margin-top: 10px;
  max-height: 46vh;
  overflow-y: auto;
  padding: 14px 16px;
  border-radius: 14px;
  background: var(--acm-bg-elevated);
  border: 1px solid var(--acm-border-soft);
  box-sizing: border-box;
  color: var(--acm-text-primary);
  font-size: 14px;
  line-height: 1.8;
  white-space: pre-wrap;
}

.notice-content-body text {
  display: block;
  white-space: pre-wrap;
}

.summary-label {
  display: block;
  font-size: 12px;
  font-weight: 800;
  color: var(--acm-text-secondary);
}

.summary-value {
  display: block;
  margin-top: 6px;
  font-size: 13px;
  font-weight: 750;
  color: var(--acm-text-primary);
}

.offer-search-row {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) auto;
  gap: 12px;
  align-items: center;
}

.offer-count-tip {
  font-size: 12px;
  color: var(--acm-text-secondary);
}

.offer-table-scroll {
  max-height: calc(70vh - 260px);
  min-height: 160px;
  border: 1px solid var(--acm-border-soft);
  border-radius: 14px;
  overflow: hidden;
}

.offer-detail-table {
  min-width: 620px;
}

.offer-detail-head,
.offer-detail-row {
  display: grid;
  grid-template-columns: 1.2fr 1fr 1fr 1fr;
  align-items: center;
  column-gap: 12px;
  padding: 0 16px;
  box-sizing: border-box;
}

.offer-detail-head {
  height: 42px;
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--acm-bg-elevated);
  border-bottom: 1px solid var(--acm-border-soft);
  font-size: 12px;
  font-weight: 850;
  color: var(--acm-text-secondary);
}

.offer-detail-row {
  min-height: 54px;
  border-bottom: 1px solid var(--acm-border-soft);
  font-size: 13px;
  color: var(--acm-text-regular);
}

.modal-empty {
  min-height: 160px;
  border: 1px dashed var(--acm-border-strong);
  border-radius: 14px;
  color: var(--acm-text-secondary);
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--acm-bg-elevated);
}

@media screen and (max-width: 1280px) {
  .admin-app { min-width: 1080px; }
  .chain-row { grid-template-columns: repeat(3, 1fr); }
  .chain-arrow { display: none; }
  .service-grid { grid-template-columns: repeat(2, 1fr); }
}

@media screen and (max-width: 900px) {
  .admin-app {
    min-width: 0;
    height: 100vh;
    flex-direction: column;
  }

  .app-sidebar {
    width: 100%;
    flex: 0 0 auto;
    min-height: 0;
  }

  .sidebar-brand {
    height: 58px;
  }

  .sidebar-nav {
    flex-direction: row;
    overflow-x: auto;
    padding: 10px 12px;
  }

  .nav-item {
    flex: 0 0 auto;
    height: 38px;
    border-radius: 12px;
  }

  .sidebar-footer {
    display: none;
  }

  .content-inner {
    padding: 16px;
  }

  .kpi-grid,
  .mini-kpi-grid,
  .split-grid,
  .workbench-grid,
  .users-grid,
  .merchants-grid,
  .market-grid,
  .notifications-grid,
  .service-grid,
  .ops-actions-grid {
    grid-template-columns: 1fr;
  }

  .chain-row {
    grid-template-columns: 1fr;
  }

  .panel-header,
  .filter-bar,
  .action-row,
  .offer-header,
  .table-pagination {
    align-items: flex-start;
    flex-direction: column;
  }

  .table {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .sticky-panel {
    position: static;
  }

  .two-cols,
  .offer-row,
  .merchant-summary-card,
  .offer-search-row {
    grid-template-columns: 1fr;
  }

  .offer-modal {
    width: calc(100vw - 32px);
    max-height: 82vh;
  }
}
</style>

