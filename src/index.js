import { default as cardSwipe } from './cardswipe.js';

const VueCardSwipe = {
  install(vue, opts) {
    // provide plugin to Vue
    Vue.prototype.$cardSwipe = cardSwipe;
    // Vue.mixin({
    //   mounted() {
    //     cardSwipe.methods.init(opts);
    //   }
    // });
  }
}

export default VueCardSwipe;

if (typeof window !== 'undefined' && window.Vue) {
  window.Vue.use(VueCardSwipe)
}
