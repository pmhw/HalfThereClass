// components/price/price.js
Component({
  properties: {
    price: {
      type: Number,
      value: 0,
    },
    originalPrice: {
      type: Number,
      value: 0,
    },
    isFree: {
      type: Boolean,
      value: false,
    },
    size: {
      type: String,
      value: 'normal', // small, normal, large
    },
  },
});
