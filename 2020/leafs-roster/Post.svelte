<script>
  import Head from '../../components/Head.svelte'
  import Foot from '../../components/Foot.svelte'
  import byCol from './data/byCol2.json'
  import { Timeline, Column, Line, Ticks, Bar } from '/Users/spencer/mountain/somehow-timeline/src'
  export let title = 'Toronto Maple Leafs roster changes'
  export let sub = ''
  let start = 'nov 1 2008'
  let end = 'dec 31 2019'
  let height = '1500'
  // let cols = colors.combos.yukon.concat(colors.combos.bloor).concat(colors.combos.roma)
  // let cols = [].concat(colors.combos.yukon, colors.combos.yukon, colors.combos.yukon)
  // cols = []
  // let years = Object.keys(data)
  const colors = {
    2009: 'blue',
    2010: 'red',
    2011: 'fuscia',
    2012: 'navy',
    2013: 'blue',
    2014: 'red',
    2015: 'fuscia',
    2016: 'navy',
    2017: 'blue',
    2018: 'red',
    2019: 'fuscia',
    // 2011: 'green',
    // 2012: 'suede',
    // 2013: 'pink',
    // 2014: 'rouge',
    // 2015: '#6699cc',
    // 2016: 'olive',
    // 2017: 'purple',
    // 2018: '#cc7066',
    // 2019: '#F2C0BB',
    // 2020: '#a3a5a5',
    // '#C4ABAB',
    // '#8C8C88',
    // '#705E5C',
    // '#2D85A8',
    // '#e6d7b3',
    // '#cc7066',
  }
</script>

<style>
  .m3 {
    margin: 3rem;
  }
  .row {
    display: flex;
    flex-direction: row;
    justify-content: space-around;
    align-items: center;
    text-align: center;
    flex-wrap: nowrap;
    align-self: stretch;
  }
  .player {
    font-size: 14px;
    min-height: 175px;
    max-height: 175px;
    min-width: 50px;
    max-width: 50px;
    border-right: 3px solid steelblue;
    text-align: left;
    position: relative;
  }
  .name {
    position: absolute;
    bottom: 60px;
    width: 130px;
    height: 12px;
    transform: rotate(-90deg);
    white-space: nowrap;
    left: 0px;
  }
  .year {
    width: 50px;
  }
</style>

<div>
  <Head {title} {sub} num={'09'} />
  <div class="m3">{title}</div>
  <div class="m3">
    <Timeline {start} {end} {height}>
      <Ticks every="decade" />
      <Ticks every="year" size="8px" color="lightgrey" underline={false} />
      {#each byCol as list, i}
        <Column width="50px">
          {#each list as player, i}
            <Line
              start={'jan 1 ' + player.start}
              duration={player.years * 12 + ' months'}
              label={player.name}
              title={player.start + '-' + player.years}
              rotate={true}
              margin={5}
              opacity="0.5"
              color={colors[player.start] || 'blue'} />
          {/each}
        </Column>
      {/each}
    </Timeline>
  </div>
  <Foot {title} />
</div>
