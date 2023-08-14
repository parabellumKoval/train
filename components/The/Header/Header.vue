<style src="./header.scss" lang="scss" scoped />

<template>
  <div>
    <header>
      <div class="container">
        <div class="row">
          <div class="col-sm-12 col-md-6">
            <div class="logo">
              <IconCSS name="lucide:train-track" size="24" class="icon-css"></IconCSS>
              {{ $t('app.name') }}
            </div>
          </div>
        </div>
      </div>
    </header>
    <div class="subheader">
      <div class="background">
        <nuxt-img
          src="/images/header.jpg"
          class="background-img"
        />
      </div>
    </div>
  </div>
</template>