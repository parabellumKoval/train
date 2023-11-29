<script setup>
</script>

<style src="./header.scss" lang="scss" scoped />

<template>
  <div>
    <header>
      <div class="container">
        <div class="row">
          <div class="col-sm-12 col-md-3">
            <div class="logo">
              <Icon name="noto-v1:bullet-train" size="50" class="icon-css"></Icon>
              <div class="name">
                <div class="name-1">ЗАЛІЗНИЧНІ</div>
                <div class="name-2">ВАНТАЖОПЕРЕВЕЗЕННЯ</div>
                <!-- {{ $t('app.name') }} -->
              </div>
            </div>
          </div>
          <div class="col-sm-12 col-md-9">
            <ul class="menu">
              <li class="menu-item">
                <NuxtLink :to="localePath('/')" class="menu-link">Розрахунок маршрутів</NuxtLink>
              </li>
              <li class="menu-item">
                <NuxtLink :to="localePath('/readiness')" class="menu-link">Розрахунок перевезення вантажів</NuxtLink>
              </li>
            </ul>
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