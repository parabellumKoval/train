// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },
  css: [
    "bootstrap/dist/css/bootstrap.min.css",
    '@/assets/scss/main.scss'
  ],
  modules: [
    [
      'nuxt-icon',
      {
        class: 'icon'
      }
    ],
    [
      '@nuxtjs/google-fonts',
      {
        families: {
          Raleway: {
            wght: [400, 500, 600, 700, 900]
          },
        },
        display: 'swap',
        preload: true
      }
    ],
    [
      '@nuxt/image',
      { 
        provider: process.env.IMAGE_PROVIDER || "ipx",
        screens: {
          mobile: 767,
          tablet: 1023,
          desktop: 1919,
        },
        format: ['avif'],
        dir: 'public',
        vercel: {
          dirname: 'public'
        },
      }
    ],
    [
      '@nuxtjs/i18n',
      {
        baseUrl: 'https://po.ua',
        defaultLocale: 'uk',
        lazy: true,
        langDir: './lang',
        locales: [ 
          {
            iso: 'uk-UA',
            code: 'uk',
            file: 'uk.yaml',
            name: 'Українська',
            shortName: 'UA',
          }
        ],
        // experimental: {
        //   jsTsFormatResource: true,
        // },
        precompile: {
          strictMessage: false
        },
        vueI18n: './i18n.config.ts'
      }
    ]
  ]
})
