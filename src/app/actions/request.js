import { tokenBalanceData } from 'Utilities/wallet'
import {
  toBigNumber,
  toSmallestDenomination,
  toMainDenomination,
  toUnit,
  toPercentage
} from 'Utilities/convert'
import { fixPercentageRounding, filterErrors, filterObj } from 'Utilities/helpers'
import { fetchGet, fetchPost, fetchDelete } from 'Utilities/fetch'
import { clearSwap } from 'Utilities/storage'
import log from 'Utilities/log'
import { loadingPortfolio, setPortfolio, setAssets, updateSwapOrder } from 'Actions/redux'
import { restoreSwundle } from 'Actions/portfolio'
import config from 'Config'
import web3 from 'Services/Web3'

const ENABLED_ASSETS = ['ETH']

const batchRequest = (batch, batchableFn, ...fnArgs) => {
  if (batch) {
    return new Promise((resolve, reject) => {
      batch.add(
        batchableFn.request(...fnArgs, (err, result) => {
          if (err) return reject(err)

          resolve(result)
        })
      )
    })
  }
  return batchableFn(...fnArgs)
}

const getETHTokenBalance = (address, symbol, contractAddress, batch = null) => () =>
  batchRequest(batch, web3.eth.call, {
    to: contractAddress,
    data: tokenBalanceData(address)
  }, 'latest')

const getBalanceActions = {
  ETH: (address, batch = null) => () => batchRequest(batch, web3.eth.getBalance, address, 'latest'),
  ETC: () => () => Promise.resolve(0), // TODO

  BTC: () => () => Promise.resolve(0), // TODO: implement balance discovery using trezor/hd-wallet
  BCH: () => () => Promise.resolve(0), // TODO
  BTG: () => () => Promise.resolve(0), // TODO

  LTC: () => () => Promise.resolve(0), // TODO
  ZEC: () => () => Promise.resolve(0), // TODO
  DASH: () => () => Promise.resolve(0), // TODO
  MIOTA: () => () => Promise.resolve(0), // TODO
  XMR: () => () => Promise.resolve(0), // TODO
  NEO: () => () => Promise.resolve(0), // TODO
}

export const getBalance = (asset, walletAddress, mock, batch) => (dispatch) => {
  const { symbol } = asset
  if (mock && mock[symbol] && mock[symbol].hasOwnProperty('balance')) {
    return Promise.resolve(toSmallestDenomination(mock[symbol].balance, asset.decimals))
  }
  const getBalanceAction = getBalanceActions[symbol]
  let balance;
  if (getBalanceAction) {
    balance = dispatch(getBalanceAction(walletAddress, batch))
  } else if (asset.ERC20) {
    balance = dispatch(getETHTokenBalance(walletAddress, symbol, asset.contractAddress, batch))
  } else {
    console.log(`Cannot get balance for asset ${symbol}`)
    balance = Promise.resolve(0)
  }
  return balance.then(toBigNumber)
}

export const getFiatPrice = (symbol, mock) => () => {
  if (mock && mock[symbol] && mock[symbol].hasOwnProperty('price')) {
    return Promise.resolve({ price_usd: toBigNumber(mock[symbol].price) })
  }
  return fetchGet(`${config.siteUrl}/app/portfolio-price/${symbol}`)
    .then((data) => {
      if (data.error) throw new Error(data.error)

      return data
    })
}

export const getPriceChart = (symbol) => () => {
  return fetchGet(`${config.siteUrl}/app/portfolio-chart/${symbol}`)
    .then((data) => {
      if (data.error) throw new Error(data.error)
      return data
    })
}

export const getFiatPrices = (list, mock) => () => {
  return fetchGet(`${config.siteUrl}/app/portfolio-price`)
    .then((data) => {
      if (data.error) throw new Error(data.error)

      return list.map(a => {
        if (mock && mock[a.symbol] && mock[a.symbol].hasOwnProperty('price')) {
          return Object.assign({}, a, {
            price: toBigNumber(mock[a.symbol].price),
            change24: toBigNumber(0)
          })
        }

        const priceData = data.find(b => b.symbol === a.symbol)
        if (!priceData) return a

        return Object.assign({}, a, {
          price: toBigNumber(priceData.price_usd || 0),
          change24: toBigNumber(priceData.percent_change_24h || 0),
          volume24: toBigNumber(priceData['24h_volume_usd'] || 0),
          marketCap: toBigNumber(priceData.market_cap_usd || 0),
        })
      })
    })
    .catch((e) => {
      log.error(e)
      return list
    })
}

const preparePortfolio = (assets, mock) => () => {
  log.info('preparing portfolio')
  return assets.map((a) => {
    if (a.ERC20 && !a.contractAddress) {
      console.log(`contractAddress is missing for ERC20 token ${a.symbol}`)
    }
    const portfolioSupport = (a.ERC20 && a.contractAddress) || ENABLED_ASSETS.includes(a.symbol)
    const swapSupport = a.deposit && a.receive
    const assetObj = Object.assign({}, a, {
      portfolio: portfolioSupport && swapSupport
    })
    if (mock && mock[a.symbol] && mock[a.symbol].price) {
      assetObj.price = mock[a.symbol].price
    }
    return assetObj
  })
}

export const getBalances = (assets, portfolio, walletAddress, mock) => (dispatch) => {
  let portfolioList = portfolio.list
  if (!portfolioList || !portfolioList.length) {
    dispatch(loadingPortfolio(true))
    portfolioList = dispatch(preparePortfolio(assets, mock))
  }
  return dispatch(getFiatPrices(portfolioList, mock))
    .then((p) => {
      const batch = new web3.BatchRequest()
      const promises = Promise.all(p.map((a) =>
        dispatch(getBalance(a, walletAddress, mock, batch))
          .then((b) => Object.assign({}, a, { balance: toMainDenomination(b, a.decimals) }))
          .catch((err) => {
            console.error(`Error retrieving balance for ${a.symbol}: `, err)
            return Object.assign({}, a, { balance: toBigNumber(0) })
          })))
      batch.execute()
      return promises
    })
    .then((p) => {
      // let pendingFiat = toBigNumber(0)
      // if (swap) {
      //   pendingFiat = swap.reduce((sCurr, send) => {
      //     const rFiat = send.list.reduce((rCurr, receive) => {
      //       const status = getSwapStatus(receive)
      //       if (status.details === 'waiting for transaction receipt' || status.details === 'processing swap') {
      //         const toAsset = p.find(a => a.symbol === receive.symbol)
      //         const receiveEst = estimateReceiveAmount(receive, toAsset)
      //         return toPrecision(receiveEst.times(toAsset.price), 2).add(rCurr)
      //       } else {
      //         return rCurr
      //       }
      //     }, toBigNumber(0))
      //     return rFiat.add(sCurr)
      //   }, toBigNumber(0))
      // }

      let totalFiat = toBigNumber(0);
      let totalFiat24hAgo = toBigNumber(0)
      let newPortfolio = p.map(a => {
        if (a.symbol === 'ETH' || a.balance.greaterThan(0)) {
          return Object.assign({}, a, { shown: true })
        } else {
          return a
        }
      })
      newPortfolio = newPortfolio.map((b) => {
        const fiat = toUnit(b.balance, b.price, 2)
        const price24hAgo = b.price.div(b.change24.plus(100).div(100))
        const fiat24hAgo = toUnit(b.balance, price24hAgo, 2)
        totalFiat = totalFiat.plus(fiat)
        totalFiat24hAgo = totalFiat24hAgo.plus(fiat24hAgo)
        return Object.assign({}, b, { fiat })
      })
      newPortfolio = newPortfolio.map((a) => {
        return Object.assign({}, a, {
          percentage: toPercentage(a.fiat, totalFiat)
        })
      }).sort((a, b) => a.fiat.minus(b.fiat).toNumber()).reverse()
      newPortfolio = fixPercentageRounding(newPortfolio, totalFiat)
      const totalChange = totalFiat.minus(totalFiat24hAgo).div(totalFiat24hAgo).times(100)
      dispatch(setPortfolio({
        total: totalFiat,
        total24hAgo: totalFiat24hAgo,
        totalChange: totalChange,
        // pending: pendingFiat,
        list: newPortfolio
      }))
      dispatch(loadingPortfolio(false))
    })
    .catch((err) => {
      log.error(err)
      dispatch(loadingPortfolio(false))
      throw err
    })
}

export const getAssets = () => (dispatch) => {
  return fetchGet(`${config.siteUrl}/app/assets`)
    .then((assets) => {
      dispatch(setAssets(assets))
      return assets
    })
    .catch((err) => {
      log.error(err)
      throw err
    })
}

export const getMarketInfo = (pair) => () => {
  return fetchGet(`${config.apiUrl}/marketinfo/${pair}`)
    .then((data) => {
      if (data.error) throw new Error(data.error)

      return data
    })
}

export const postExchange = (info) => () => {
  return fetchPost(`${config.apiUrl}/shift`, info)
    .then((data) => {
      if (data.error || !data.orderId) throw new Error(data.error)

      return data
    })
    .catch((err) => {
      log.error(err)
      const errMsg = filterErrors(err)
      throw new Error(errMsg)
    })
}

export const getOrderStatus = (depositSymbol, receiveSymbol, address, timestamp) => (dispatch) => {
  let url = `${config.apiUrl}/txStat/${address}`
  if (timestamp) url += `?after=${timestamp}`
  return fetchGet(url)
    .then((data) => {
      log.info('order status receive', data)
      // if (data.error || !data.status) throw new Error(data.error)

      const order = filterObj(['status', 'transaction', 'outgoingCoin', 'error'], data)

      dispatch(updateSwapOrder(depositSymbol, receiveSymbol, order))
      return data
    })
    .catch((err) => {
      log.error(err)
      const errMsg = filterErrors(err)
      throw new Error(errMsg)
    })
}

export const getSwundle = (address, isMocking) => (dispatch) => {
  let url = `${config.apiUrl}/swundle/${address}`
  fetchGet(url)
  .then((data) => {
    if (data.result && data.result.swap) {
      dispatch(restoreSwundle(data.result.swap, address, isMocking))
    }
  })
  .catch(log.error)
}

export const postSwundle = (address, swap) => () => {
  const url = `${config.apiUrl}/swundle/${address}`
  fetchPost(url, { swap })
  .catch(log.error)
}

export const removeSwundle = (address) => () => {
  clearSwap(address)
  const url = `${config.apiUrl}/swundle/${address}`
  fetchDelete(url)
  .catch(log.error)
}
