// Types.

type Sdk = {
  id: number
  name: string
}

type Churn = {
  from_sdk: number
  to_sdk: number
  count: number
}

type App = {
  id: number
  name: string
  seller_name: string
}

// We'll use the URL as a state management solution.
const baseUrl = new URL(window.location.href)

// SDK IDs to draw the graph.
const idParamName = 'id'
const ids = Array.from(
  new Set([
    ...baseUrl.searchParams
      .getAll(idParamName)
      // We'll operatate these IDs as numbers.
      .map((id) => Number.parseInt(id))
      .filter((id) => typeof id === 'number' && !Number.isNaN(id)),
  ]),
)

// Whether normal flag is on or not.
const showNormal = baseUrl.searchParams.has('normal')

// Selected SDK ID to show example apps.
const selected = baseUrl.searchParams.get('selected')

function updateSearchParams(newIds: number[], newNormal: boolean, newSelected: string | null) {
  let search = ''
  if (newIds.length > 0) search += `${idParamName}=${newIds.join(`&${idParamName}=`)}`
  if (newNormal) search += '&normal'
  if (newSelected) search += `&selected=${newSelected}`

  window.location.search = search
}

function toggleNormal() {
  updateSearchParams(ids, !showNormal, selected)
}

function toggleIdParam(id: number) {
  // Splice in/out based on whether it exists or not.
  const index = ids.indexOf(id)
  if (index === -1) ids.push(id)
  else ids.splice(index, 1)
  updateSearchParams(ids, showNormal, selected)
}

function selectSdkId(id: string | null) {
  updateSearchParams(ids, showNormal, id)
}

// If ids are not specified, load initial ones.
if (ids.length === 0) {
  updateSearchParams([875, 13, 2081, 33], showNormal, '13/2081')
}

async function getChurnData(sdks: Sdk[]) {
  // We have ourselves a really neat case that is we're trying to use the same
  // search params for both index.html and api/graph so we can just change the
  // pathname and pass the entire URL object along.
  const url = new URL(window.location.href)
  url.pathname = '/api/churn'
  const response = await fetch(url)
  const json: Churn[] = await response.json()

  // Find sums by row, to use for normalization.
  const sdkIds = sdks.map((sdk) => sdk.id)
  const sumsByRow = json
    .filter((x) => sdkIds.includes(x.from_sdk) && sdkIds.includes(x.to_sdk))
    .reduce<Record<number, number>>((acc, curr) => {
      acc[curr.from_sdk] = (acc[curr.from_sdk] ?? 0) + curr.count
      return acc
    }, {})

  // Collect normals.
  const jsonWithNormal = json.map((churn) => {
    const sum = sumsByRow[churn.from_sdk] ?? 0
    const normal = churn.count === 0 ? 0 : churn.count / sum
    return {...churn, normal}
  })

  return jsonWithNormal
}

async function drawGraph(sdks: Sdk[]) {
  const json = await getChurnData(sdks)
  const table = document.querySelector('table#graph') as HTMLTableElement

  // First row is labels.
  const theadtr = table.querySelector('thead > tr') as HTMLTableCellElement
  const ths = sdks.map((sdk) => {
    const th = document.createElement('th')
    th.textContent = sdk.name
    return th
  })
  theadtr.append(...ths)

  const tbody = table.querySelector('tbody') as HTMLTableSectionElement
  const trs = sdks.map((from_sdk) => {
    const tr = document.createElement('tr')

    // First cell is label for each rows.
    const labelTh = document.createElement('th')
    labelTh.textContent = from_sdk.name
    tr.appendChild(labelTh)

    // These are data cells.
    const tds = sdks.map((to_sdk) => {
      // biome-ignore format: single line reads better.
      const data = json.find((x) => x.from_sdk === from_sdk.id && x.to_sdk === to_sdk.id);

      // Lower green and blue values based on normal. We subtract normal from 0.95 instead
      // of 10 because I want to start from barely visible pink to red instead of going from
      // nothing to red. Also see how I have 251 for normal values of 0 as well, same reason.
      const normal = data?.normal ?? 0
      const colorHex = normal === 0 ? 251 : (0.95 - normal) * 255
      const rgbValues = [255, colorHex, colorHex].map((x) => String(x))
      if (showNormal) rgbValues.reverse()

      const td = document.createElement('td')
      const textColor = colorHex < 127 ? 'white' : 'black'
      td.style = `background-color: rgb(${rgbValues.join(', ')}); color: ${textColor}`

      const countSpan = document.createElement('span')
      countSpan.className = 'count'
      countSpan.textContent = String(data?.count ?? 0)

      const normalSpan = document.createElement('span')
      normalSpan.className = 'normal'
      normalSpan.textContent = `${Math.round(normal * 100)}%`

      // Show hide spans based on normal state.
      countSpan.style.display = !showNormal ? 'inline' : 'none'
      normalSpan.style.display = showNormal ? 'inline' : 'none'

      // Select one to show example apps on cell click.
      td.addEventListener('click', () => {
        selectSdkId(`${from_sdk.id}/${to_sdk.id}`)
      })

      td.append(countSpan, normalSpan)
      return td
    })

    tr.append(...tds)
    return tr
  })

  tbody.append(...trs)
}

function renderSdkSelection(allSdks: Sdk[], selectedSdks: Sdk[]) {
  const selectedSdkIds = selectedSdks.map((sdk) => sdk.id)
  const container = document.querySelector('section#sdks') as HTMLElement

  const sdkSelections = allSdks.map((sdk) => {
    const label = document.createElement('label')
    label.className = 'sdk'

    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.name = sdk.name
    checkbox.value = String(sdk.id)
    checkbox.checked = selectedSdkIds.includes(sdk.id)
    checkbox.style.display = 'none'
    checkbox.addEventListener('change', (e) => {
      const id = Number.parseInt(e.target.value)
      if (typeof id === 'number' && !Number.isNaN(id)) toggleIdParam(id)
    })

    label.append(checkbox, document.createTextNode(sdk.name))
    return label
  })

  container.append(...sdkSelections)
}

function renderNormalToggle() {
  const section = document.querySelector('section#normal-toggle') as HTMLElement

  const label = document.createElement('label')
  label.className = 'normal-toggle-label'

  const input = document.createElement('input') as HTMLInputElement
  input.type = 'checkbox'
  input.checked = showNormal
  label.append(input, document.createTextNode('View normalized values'))
  input.addEventListener('change', () => toggleNormal())

  section.append(label)
}

function renderApps(sdks: Sdk[], apps: App[]) {
  // Load from and to SDKs.
  if (!selected) return
  const [from, to] = selected
    .split('/')
    .map((x) => Number.parseInt(x))
    .map((id) => sdks.find((sdk) => sdk.id === id))
  console.log(selected, from, to)
  if (!from || !to) return

  const section = document.querySelector('section#apps') as HTMLElement

  // Add section heading.
  const h3 = document.createElement('h3')
  h3.textContent =
    from.id === to.id ? `Apps using ${from.name}` : `Apps moved to ${to.name} from ${from.name}`
  section.append(h3)

  // Render rows of apps.
  const appsRendered = apps.map((app) => {
    const div = document.createElement('div')
    div.className = 'app'

    const image = document.createElement('img')
    image.src = app.artwork_large_url

    const data = document.createElement('data')
    const name = document.createElement('div')
    name.textContent = app.name
    const sellerName = document.createElement('div')
    sellerName.textContent = app.seller_name
    data.append(name, sellerName)

    div.append(image, data)
    return div
  })

  section.append(...appsRendered)
}

window.addEventListener('load', async () => {
  // Fetch SDK details on load.
  const allSdks: Sdk[] = await fetch('/api/sdks').then((res) => res.json())
  const selectedSdks = ids.map((id) => allSdks.find((sdk) => sdk.id === id)).filter((id) => !!id)

  // Render SDKs selection.
  renderSdkSelection(allSdks, selectedSdks)

  // Render Normal checkbox
  renderNormalToggle()

  // We show ASIDE after we've rendered SDK selection otherwise we'll have a CLS.
  const aside = document.querySelector('aside') as HTMLElement
  aside.style.display = 'block'

  // Draw our graph.
  await drawGraph(selectedSdks)

  // Show example apps.
  if (!selected) return

  // biome-ignore format: single line reads better.
  const apps: App[] = await fetch(`api/apps/${selected}`).then((res) => res.json());
  renderApps(selectedSdks, apps)
})
