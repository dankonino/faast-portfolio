import React, { Component } from 'react'
import PropTypes from 'prop-types'
import { connect } from 'react-redux'
import isEqual from 'lodash/isEqual'
import toastr from 'Utilities/toastrWrapper'
import blockstack from 'Utilities/blockstack'
import App from 'Views/App'
import withMockHandling from '../hoc/withMockHandling'
import { restorePolling } from 'Actions/portfolio'
import { setSwap } from 'Actions/redux'

class AppController extends Component {
  constructor () {
    super()
  }

  componentWillMount () {
    if (this.props.swap.length) {
      this.props.restorePolling(this.props.swap, this.props.mocking)
    }
  }

  componentDidUpdate (prevProps, prevState) {
    // if (prevState.mq.lg && !this.state.mq.lg) {
    //   toastr.confirm(null, {
    //     disableCancel: true,
    //     component: () => (
    //       <div style={{ padding: 10, color: 'black' }}>
    //         The portfolio is only optimized for large screens at this time. Support for smaller screens is in progress
    //       </div>
    //     )
    //   })
    // }
    // if (this.props.wallet.type === 'blockstack' && !isEqual(prevProps.settings, this.props.settings)) {
    //   blockstack.saveSettings(this.props.settings)
    // }
  }

  render () {
    return (
      <App />
    )
  }
}

AppController.propTypes = {
  wallet: PropTypes.object.isRequired,
  swap: PropTypes.array.isRequired
}

const mapStateToProps = (state) => ({
  wallet: state.wallet,
  swap: state.swap,
  settings: state.settings,
  mq: state.setMediaQueries
})

const mapDispatchToProps = (dispatch) => ({
  restorePolling: (swap, isMocking) => {
    dispatch(restorePolling(swap, isMocking))
  },
  setSwap: (swap) => {
    dispatch(setSwap(swap))
  }
})

export default connect(mapStateToProps, mapDispatchToProps)(withMockHandling(AppController))