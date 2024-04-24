const http = require('https') // or 'https' for https:// URLs
const sequentialPromiseAll = require('sequential-promise-all')
const { getBody } = require('body-snatchers')
const fs = require('fs')
const jsdom = require('jsdom')
const { JSDOM } = jsdom
const fetch = require('node-fetch')

const lang = 'eng'
const baseUrl = 'https://www.churchofjesuschrist.org'
const month = process.argv[2] || '04'
const year = process.argv[3] || '2024'

async function getPage1() {
  const page1Url = `${baseUrl}/study/general-conference/${year}/${month}?lang=${lang}`
  const page1Body = await getBody(page1Url, false)
  return page1Body
}

const fetchJson = async (url, options = {}) => {
  const res = await fetch(url, options)
  const json = await res.json()
  return json
}

async function getItems(pageBody) {
  const dom = new JSDOM(pageBody)
  const itemElements = [...dom.window.document.querySelectorAll('nav.manifest ul.doc-map  ul.doc-map li:not(:first-child) .list-tile')]
  // console.log(itemElements.length)
  const outputFilenames = itemElements
    .map(item => `${item.querySelector('.primaryMeta').textContent}-${item.querySelector('.title').textContent}`.trim())
    .map(str => str.replace(/[^a-z\s-]/ig, '')) // filter out unexpected characters
    .map(str => `${str}.mp3`)

  const itemHrefs = itemElements.map(item => item.href)
  // console.log(itemHrefs)
  const dataLinks = itemHrefs.map(item => {
    const urlObj = new URL(`${baseUrl}${item}`)
    const dataLink = `${baseUrl}/study/api/v3/language-pages/type/content?lang=${lang}&uri=${urlObj.pathname.split('/study')[1]}`
    return dataLink
  })
  const pArray = dataLinks.map(item => {
    return fetchJson(item)
  })
  const datas = await Promise.all(pArray)
  const mp3DownloadLinks = datas.map(item => {
    const json = item
    const mp3Link = json.meta.audio[0].mediaUrl
    return `${mp3Link}?download=true`
  })
  return mp3DownloadLinks
    .map((link, i) => {
      return [link, `./output/${`${i + 1}`.padStart(2, '0')}-${outputFilenames[i]}`]
    })
    .filter(([_, fileName]) => (!['Auditing Department Report', 'Sustaining of General Authorities'].includes(fileName)))
}

async function downloadAndSave(url, fileName) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(fileName)
    const request = http.get(url, function(response) {
      response.pipe(file)
      file.on("finish", () => {
        file.close()
        resolve(`Download Completed for ${url} -> ${fileName}`)
      })
    })
  })
}
(async () => {
  const page1Body = await getPage1()
  const items = await getItems(page1Body)

  const n = items.length // number of times to call promise
  console.log(`1/${n} ${[...items[0]].join(', ')}`)
  await sequentialPromiseAll(
    downloadAndSave, // function that returns a promise - must return something (will be called n times after previous one resolves)
    [...items[0]], // arguments array provided to promise (timeout)
    n, // number of times to call promise
    ( // callback - invoked after each promise resolution
      argsHandle, // modify this in the callback to change the arguments at the next invocation
      previousResponse, // what is resolved from promise (timeout)
      i) => {
      argsHandle[0] = items[i][0]
      argsHandle[1] = items[i][1]
      console.log(`${i + 1}/${n} ${argsHandle.join(', ')}`)
    })
  console.log('Done.')
})()

