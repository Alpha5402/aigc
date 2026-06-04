<script>
import { ensureAuthenticatedRoute } from './utils/auth-guard'

export default {
  onLaunch: function () {
    console.log('App Launch')
    ensureAuthenticatedRoute()
  },
  onShow: function () {
    console.log('App Show')
    ensureAuthenticatedRoute()
  },
  onHide: function () {
    console.log('App Hide')
  },
}
</script>

<style lang="scss">
/* Global utility compatibility layer migrated from React + Tailwind */
@import "./styles/global.scss";
</style>
