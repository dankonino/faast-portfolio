import React, { Component } from 'react'
import { connect } from 'react-redux'
import { restoreWallet } from 'Utilities/wallet'
import toastr from 'Utilities/toastrWrapper'
import { filterUrl } from 'Utilities/helpers'
import blockstack from 'Utilities/blockstack'
import { setWallet } from 'Actions/redux'
import BlockstackView from './view'

class Blockstack extends Component {
  constructor () {
    super()
    this._handleClick = this._handleClick.bind(this)
  }

  _handleClick () {
    if (!blockstack.isUserSignedIn()) {
      blockstack.redirectToSignIn(filterUrl())
    } else {
      const wallet = restoreWallet()
      if (wallet) {
        this.props.setWallet(wallet.type, wallet.address, wallet.data)
      } else {
        toastr.error('Unable to open BlockstackView wallet')
      }
    }
  }

  render () {
    return (
      <BlockstackView handleClick={this._handleClick} />
    )
  }
}

const mapStateToProps = () => ({})

const mapDispatchToProps = (dispatch) => ({
  setWallet: (type, address, data) => {
    dispatch(setWallet(type, address, data))
  }
})

export default connect(mapStateToProps, mapDispatchToProps)(Blockstack)
